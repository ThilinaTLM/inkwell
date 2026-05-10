// Folder repository: pure data access for `folders`.
//
// Subtree walks are recursive CTEs (Drizzle's $with builder is awkward
// for `WITH RECURSIVE` and the SQL is correct as-is). Drizzle still
// parameterizes the bound values automatically.

import { and, count, desc, eq, inArray, sql } from "drizzle-orm";
import type { Env, FileKind, FilePreview, FileRow, FolderRow } from "../../types";
import { getDb, t } from "../client";

export const MAX_DEPTH = 8;

// ─── Lookups ──────────────────────────────────────────────────────────
export async function findById(env: Env, owner: string, id: string): Promise<FolderRow | null> {
  const db = getDb(env);
  const row = await db
    .select()
    .from(t.folders)
    .where(and(eq(t.folders.id, id), eq(t.folders.owner, owner)))
    .get();
  return row ?? null;
}

export async function existsForOwner(env: Env, owner: string, id: string): Promise<boolean> {
  const db = getDb(env);
  const r = await db
    .select({ id: t.folders.id })
    .from(t.folders)
    .where(and(eq(t.folders.id, id), eq(t.folders.owner, owner)))
    .get();
  return !!r;
}

export async function listForOwner(env: Env, owner: string): Promise<FolderRow[]> {
  const db = getDb(env);
  return await db
    .select()
    .from(t.folders)
    .where(eq(t.folders.owner, owner))
    .orderBy(sql`${t.folders.name} COLLATE NOCASE ASC`)
    .all();
}

// ─── Tree walks ───────────────────────────────────────────────────────
export async function ancestorChain(env: Env, owner: string, startId: string): Promise<string[]> {
  const db = getDb(env);
  const rows = await db.all<{ id: string }>(sql`
    WITH RECURSIVE up(id, parent_id, depth) AS (
      SELECT id, parent_id, 1 FROM folders WHERE id = ${startId} AND owner = ${owner}
      UNION ALL
      SELECT f.id, f.parent_id, up.depth + 1
      FROM folders f
      JOIN up ON f.id = up.parent_id
      WHERE f.owner = ${owner} AND up.depth < 32
    )
    SELECT id FROM up
  `);
  return rows.map((r) => r.id);
}

export async function descendantIds(env: Env, owner: string, rootId: string): Promise<string[]> {
  const db = getDb(env);
  const rows = await db.all<{ id: string }>(sql`
    WITH RECURSIVE down(id) AS (
      SELECT id FROM folders WHERE id = ${rootId} AND owner = ${owner}
      UNION ALL
      SELECT f.id FROM folders f JOIN down ON f.parent_id = down.id
      WHERE f.owner = ${owner}
    )
    SELECT id FROM down
  `);
  return rows.map((r) => r.id);
}

export async function depthOf(env: Env, owner: string, id: string): Promise<number> {
  const chain = await ancestorChain(env, owner, id);
  return chain.length;
}

export async function maxSubtreeDepth(env: Env, owner: string, rootId: string): Promise<number> {
  const db = getDb(env);
  const row = await db.get<{ d: number | null }>(sql`
    WITH RECURSIVE down(id, depth) AS (
      SELECT id, 1 FROM folders WHERE id = ${rootId} AND owner = ${owner}
      UNION ALL
      SELECT f.id, down.depth + 1
      FROM folders f JOIN down ON f.parent_id = down.id
      WHERE f.owner = ${owner}
    )
    SELECT MAX(depth) AS d FROM down
  `);
  return row?.d ?? 1;
}

// All folders inside a subtree, returned as full rows (used by the
// folder-share public listing). Returns [] when the root doesn't exist.
export async function loadSubtree(env: Env, owner: string, rootId: string): Promise<FolderRow[]> {
  const db = getDb(env);
  const idRows = await db.all<{ id: string }>(sql`
    WITH RECURSIVE down(id) AS (
      SELECT id FROM folders WHERE id = ${rootId} AND owner = ${owner}
      UNION ALL
      SELECT f.id FROM folders f JOIN down ON f.parent_id = down.id
      WHERE f.owner = ${owner}
    )
    SELECT id FROM down
  `);
  if (idRows.length === 0) return [];
  const ids = idRows.map((r) => r.id);
  return await db
    .select()
    .from(t.folders)
    .where(and(eq(t.folders.owner, owner), inArray(t.folders.id, ids)))
    .orderBy(sql`${t.folders.name} COLLATE NOCASE`)
    .all();
}

// ─── Subtree containment helpers (used by share authorization) ───────
export async function fileInSubtree(
  env: Env,
  owner: string,
  fileId: string,
  folderId: string,
): Promise<boolean> {
  const db = getDb(env);
  const file = await db
    .select({ folder_id: t.files.folder_id })
    .from(t.files)
    .where(and(eq(t.files.id, fileId), eq(t.files.owner, owner)))
    .get();
  if (!file?.folder_id) return false;
  if (file.folder_id === folderId) return true;
  const chain = await ancestorChain(env, owner, file.folder_id);
  return chain.includes(folderId);
}

export async function folderInSubtree(
  env: Env,
  owner: string,
  childFolderId: string,
  rootFolderId: string,
): Promise<boolean> {
  if (childFolderId === rootFolderId) return true;
  const chain = await ancestorChain(env, owner, childFolderId);
  return chain.includes(rootFolderId);
}

// ─── Files inside a set of folders (recursive listing & folder shares) ─
export async function loadFilesInFolders(
  env: Env,
  owner: string,
  folderIds: string[],
): Promise<FileRow[]> {
  if (folderIds.length === 0) return [];
  const db = getDb(env);
  return await db
    .select()
    .from(t.files)
    .where(and(eq(t.files.owner, owner), inArray(t.files.folder_id, folderIds)))
    .orderBy(desc(t.files.updated_at))
    .limit(1000)
    .all();
}

// ─── Aggregates used by listForOwner ─────────────────────────────────
export interface FolderListAggregates {
  fileCounts: Map<string, number>;
  subfolderCounts: Map<string, number>;
  tagsByFolder: Map<string, string[]>;
  previewsByFolder: Map<string, FilePreview[]>;
}

export async function loadListAggregates(env: Env, owner: string): Promise<FolderListAggregates> {
  const db = getDb(env);
  const fileCountsP = db
    .select({ id: t.files.folder_id, n: count() })
    .from(t.files)
    .where(and(eq(t.files.owner, owner), sql`${t.files.folder_id} IS NOT NULL`))
    .groupBy(t.files.folder_id)
    .all();
  const subCountsP = db
    .select({ id: t.folders.parent_id, n: count() })
    .from(t.folders)
    .where(and(eq(t.folders.owner, owner), sql`${t.folders.parent_id} IS NOT NULL`))
    .groupBy(t.folders.parent_id)
    .all();
  const tagRowsP = db
    .select({ id: t.taggings.target_id, name: t.tags.name })
    .from(t.taggings)
    .innerJoin(t.tags, eq(t.tags.id, t.taggings.tag_id))
    .where(and(eq(t.taggings.owner, owner), eq(t.taggings.target_type, "folder")))
    .orderBy(sql`${t.tags.name} COLLATE NOCASE`)
    .all();
  // Top-3 most recently updated files per folder — powers the
  // FolderCard inner-paper previews. Single window-function query.
  const previewRowsP = db.all<{
    folder_id: string;
    id: string;
    kind: FileKind;
    has_thumb: number;
    thumb_updated_at: number;
    rn: number;
  }>(sql`
    WITH ranked AS (
      SELECT
        folder_id,
        id,
        kind,
        has_thumb,
        thumb_updated_at,
        ROW_NUMBER() OVER (PARTITION BY folder_id ORDER BY updated_at DESC, id DESC) AS rn
      FROM files
      WHERE owner = ${owner} AND folder_id IS NOT NULL
    )
    SELECT folder_id, id, kind, has_thumb, thumb_updated_at, rn FROM ranked WHERE rn <= 3
  `);

  const [fileCounts, subCounts, tagRows, previewRows] = await Promise.all([
    fileCountsP,
    subCountsP,
    tagRowsP,
    previewRowsP,
  ]);

  const fileMap = new Map(fileCounts.flatMap((r) => (r.id ? [[r.id, r.n] as const] : [])));
  const subMap = new Map(subCounts.flatMap((r) => (r.id ? [[r.id, r.n] as const] : [])));
  const tagMap = new Map<string, string[]>();
  for (const tg of tagRows) {
    const arr = tagMap.get(tg.id);
    if (arr) arr.push(tg.name);
    else tagMap.set(tg.id, [tg.name]);
  }
  const previewMap = new Map<string, FilePreview[]>();
  for (const p of previewRows) {
    const arr = previewMap.get(p.folder_id) ?? [];
    arr.push({
      id: p.id,
      kind: p.kind,
      hasThumb: p.has_thumb === 1,
      thumbUpdatedAt: p.thumb_updated_at,
    });
    previewMap.set(p.folder_id, arr);
  }
  return {
    fileCounts: fileMap,
    subfolderCounts: subMap,
    tagsByFolder: tagMap,
    previewsByFolder: previewMap,
  };
}

// Direct-children counts for a single folder (used by patchFolder response).
export async function childCounts(
  env: Env,
  owner: string,
  folderId: string,
): Promise<{ fileCount: number; subfolderCount: number }> {
  const db = getDb(env);
  const fileCountRow = await db
    .select({ n: count() })
    .from(t.files)
    .where(and(eq(t.files.owner, owner), eq(t.files.folder_id, folderId)))
    .get();
  const subCountRow = await db
    .select({ n: count() })
    .from(t.folders)
    .where(and(eq(t.folders.owner, owner), eq(t.folders.parent_id, folderId)))
    .get();
  return {
    fileCount: fileCountRow?.n ?? 0,
    subfolderCount: subCountRow?.n ?? 0,
  };
}

// ─── Mutations ───────────────────────────────────────────────────────
export async function insert(env: Env, row: FolderRow): Promise<void> {
  const db = getDb(env);
  await db.insert(t.folders).values(row).run();
}

export async function update(
  env: Env,
  owner: string,
  id: string,
  patch: Partial<FolderRow>,
): Promise<void> {
  const db = getDb(env);
  await db
    .update(t.folders)
    .set(patch)
    .where(and(eq(t.folders.id, id), eq(t.folders.owner, owner)))
    .run();
}
