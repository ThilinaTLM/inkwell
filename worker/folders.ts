// Folder CRUD + tree helpers.
//
// Folders and scenes are first-class peers. Either may live at the
// literal root level (`parent_id IS NULL` / `folder_id IS NULL`).
//
// Constraints enforced at the application layer:
//   * Folder name length 1..200 (also enforced by CHECK in schema).
//   * Max nesting depth: 8 (root = depth 1).
//   * Cycle prevention on move: target's ancestors must not include self.
//   * Cross-owner isolation: every query is `WHERE owner = ?`.
//
// Cleanup: when a folder is deleted, its direct children (scenes and
// subfolders) are moved up one level. Deleting a folder at
// `parent_id IS NULL` moves children to the root level.

import { and, count, desc, eq, inArray, sql } from "drizzle-orm";
import { getDb, t } from "./db/client";
import { countActiveSharesForTargets } from "./share";
import { listTagsFor, replaceTagsFor } from "./tags";
import type { Env, FolderMeta, FolderRow, SceneRow, ScenePreview } from "./types";
import { rowToFolderMeta } from "./types";
import { errorResponse, jsonResponse, newId, now } from "./util";

export const MAX_DEPTH = 8;

// ─── Internals ─────────────────────────────────────────────────────────
async function loadFolder(env: Env, owner: string, id: string): Promise<FolderRow | null> {
  const db = getDb(env);
  const row = await db
    .select()
    .from(t.folders)
    .where(and(eq(t.folders.id, id), eq(t.folders.owner, owner)))
    .get();
  return row ?? null;
}

// Recursive CTE walks stay as raw SQL — Drizzle's $with builder is
// awkward for `WITH RECURSIVE` and the SQL is already correct. Drizzle
// parameterizes the bound values automatically.
async function ancestorChain(env: Env, owner: string, startId: string): Promise<string[]> {
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

// "All folders inside this folder, including itself" — used for share
// authorization and scene listing recursion.
export async function descendantFolderIds(
  env: Env,
  owner: string,
  rootId: string,
): Promise<string[]> {
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

// Returns the depth of the given folder (root = 1). Useful for "would the
// move make this exceed MAX_DEPTH?".
async function folderDepth(env: Env, owner: string, id: string): Promise<number> {
  const chain = await ancestorChain(env, owner, id);
  return chain.length;
}

// Maximum depth reachable from `rootId` going downward. Returns 1 if the
// root has no descendants beyond itself.
async function maxSubtreeDepth(env: Env, owner: string, rootId: string): Promise<number> {
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

// ─── List ──────────────────────────────────────────────────────────────
// Returns flat list with counts and tags. The client builds the tree.
export async function listFolders(env: Env, owner: string): Promise<Response> {
  const db = getDb(env);

  const foldersP = db
    .select()
    .from(t.folders)
    .where(eq(t.folders.owner, owner))
    .orderBy(sql`${t.folders.name} COLLATE NOCASE ASC`)
    .all();
  const sceneCountsP = db
    .select({ id: t.scenes.folder_id, n: count() })
    .from(t.scenes)
    .where(and(eq(t.scenes.owner, owner), sql`${t.scenes.folder_id} IS NOT NULL`))
    .groupBy(t.scenes.folder_id)
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
  // Top-3 most recently updated scenes per folder — powers the
  // FolderCard inner-paper previews (front / mid / back). Single
  // window-function query; returned newest-first within each folder.
  const previewRowsP = db.all<{
    folder_id: string;
    id: string;
    has_thumb: number;
    thumb_updated_at: number;
    rn: number;
  }>(sql`
    WITH ranked AS (
      SELECT
        folder_id,
        id,
        has_thumb,
        thumb_updated_at,
        ROW_NUMBER() OVER (PARTITION BY folder_id ORDER BY updated_at DESC, id DESC) AS rn
      FROM scenes
      WHERE owner = ${owner} AND folder_id IS NOT NULL
    )
    SELECT folder_id, id, has_thumb, thumb_updated_at, rn FROM ranked WHERE rn <= 3
  `);

  const [folderRows, sceneCounts, subCounts, tagRows, previewRows] = await Promise.all([
    foldersP,
    sceneCountsP,
    subCountsP,
    tagRowsP,
    previewRowsP,
  ]);

  // Active share count per folder — single grouped query, indexed.
  const shareMap = await countActiveSharesForTargets(
    env,
    owner,
    "folder",
    folderRows.map((f) => f.id),
  );

  const sceneMap = new Map(sceneCounts.flatMap((r) => (r.id ? [[r.id, r.n] as const] : [])));
  const subMap = new Map(subCounts.flatMap((r) => (r.id ? [[r.id, r.n] as const] : [])));
  const tagMap = new Map<string, string[]>();
  for (const tg of tagRows) {
    const arr = tagMap.get(tg.id);
    if (arr) arr.push(tg.name);
    else tagMap.set(tg.id, [tg.name]);
  }
  const previewMap = new Map<string, ScenePreview[]>();
  for (const p of previewRows) {
    const arr = previewMap.get(p.folder_id) ?? [];
    arr.push({
      id: p.id,
      hasThumb: p.has_thumb === 1,
      thumbUpdatedAt: p.thumb_updated_at,
    });
    previewMap.set(p.folder_id, arr);
  }

  const out: FolderMeta[] = folderRows.map((f) =>
    rowToFolderMeta(f, {
      tags: tagMap.get(f.id) ?? [],
      sceneCount: sceneMap.get(f.id) ?? 0,
      subfolderCount: subMap.get(f.id) ?? 0,
      previews: previewMap.get(f.id) ?? [],
      activeShareCount: shareMap.get(f.id) ?? 0,
    }),
  );
  return jsonResponse({ folders: out });
}

// ─── Create ────────────────────────────────────────────────────────────
export async function createFolder(req: Request, env: Env, owner: string): Promise<Response> {
  let body: { name?: string; parentId?: string | null; tags?: string[] };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return errorResponse(400, "invalid JSON");
  }
  const name = (body.name ?? "").trim().slice(0, 200);
  if (!name) return errorResponse(400, "name required");
  const parentId = body.parentId ?? null;
  if (parentId !== null) {
    const parent = await loadFolder(env, owner, parentId);
    if (!parent) return errorResponse(404, "parent folder not found");
    const depth = await folderDepth(env, owner, parentId);
    if (depth >= MAX_DEPTH) return errorResponse(400, `max nesting depth is ${MAX_DEPTH}`);
  }
  const id = newId();
  const ts = now();
  const db = getDb(env);
  await db
    .insert(t.folders)
    .values({
      id,
      owner,
      parent_id: parentId,
      name,
      created_at: ts,
      updated_at: ts,
    })
    .run();

  let tags: string[] = [];
  if (Array.isArray(body.tags)) {
    tags = await replaceTagsFor(env, owner, "folder", id, body.tags);
  }

  const row: FolderRow = {
    id,
    owner,
    parent_id: parentId,
    name,
    created_at: ts,
    updated_at: ts,
  };
  return jsonResponse(rowToFolderMeta(row, { tags, sceneCount: 0, subfolderCount: 0 }));
}

// ─── Update (rename / move / retag) ───────────────────────────────────
export async function patchFolder(
  req: Request,
  env: Env,
  owner: string,
  id: string,
): Promise<Response> {
  const folder = await loadFolder(env, owner, id);
  if (!folder) return errorResponse(404, "folder not found");

  let body: { name?: string; parentId?: string | null; tags?: string[] };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return errorResponse(400, "invalid JSON");
  }

  let nextName = folder.name;
  let nextParent: string | null = folder.parent_id;

  if (body.name !== undefined) {
    const trimmed = body.name.trim().slice(0, 200);
    if (!trimmed) return errorResponse(400, "name required");
    nextName = trimmed;
  }

  if (body.parentId !== undefined && body.parentId !== folder.parent_id) {
    const newParent = body.parentId;
    if (newParent === id) return errorResponse(400, "cannot nest a folder under itself");
    if (newParent !== null) {
      const target = await loadFolder(env, owner, newParent);
      if (!target) return errorResponse(404, "parent folder not found");
      // Cycle check: target must not be a descendant of `id`.
      const descendants = await descendantFolderIds(env, owner, id);
      if (descendants.includes(newParent)) {
        return errorResponse(400, "cannot move a folder into its own descendant");
      }
      // Depth check: target depth + subtree depth must not exceed MAX_DEPTH.
      const targetDepth = await folderDepth(env, owner, newParent);
      const subtree = await maxSubtreeDepth(env, owner, id);
      if (targetDepth + subtree > MAX_DEPTH) {
        return errorResponse(400, `max nesting depth is ${MAX_DEPTH}`);
      }
    }
    nextParent = newParent;
  }

  const ts = now();
  const db = getDb(env);
  await db
    .update(t.folders)
    .set({ name: nextName, parent_id: nextParent, updated_at: ts })
    .where(and(eq(t.folders.id, id), eq(t.folders.owner, owner)))
    .run();

  let tags = await listTagsFor(env, "folder", id);
  if (Array.isArray(body.tags)) {
    tags = await replaceTagsFor(env, owner, "folder", id, body.tags);
  }

  const sceneCountRow = await db
    .select({ n: count() })
    .from(t.scenes)
    .where(and(eq(t.scenes.owner, owner), eq(t.scenes.folder_id, id)))
    .get();
  const subCountRow = await db
    .select({ n: count() })
    .from(t.folders)
    .where(and(eq(t.folders.owner, owner), eq(t.folders.parent_id, id)))
    .get();

  const updated: FolderRow = {
    ...folder,
    name: nextName,
    parent_id: nextParent,
    updated_at: ts,
  };
  return jsonResponse(
    rowToFolderMeta(updated, {
      tags,
      sceneCount: sceneCountRow?.n ?? 0,
      subfolderCount: subCountRow?.n ?? 0,
    }),
  );
}

// ─── Delete ────────────────────────────────────────────────────────────
// Children (scenes + subfolders) move up one level. Deleting a folder at
// the root level (`parent_id IS NULL`) leaves its children at the root.
export async function deleteFolder(env: Env, owner: string, id: string): Promise<Response> {
  const folder = await loadFolder(env, owner, id);
  if (!folder) return errorResponse(404, "folder not found");

  const ts = now();
  const db = getDb(env);
  await db.batch([
    // Move direct subfolders up.
    db
      .update(t.folders)
      .set({ parent_id: folder.parent_id, updated_at: ts })
      .where(and(eq(t.folders.owner, owner), eq(t.folders.parent_id, id))),
    // Move direct scenes up.
    db
      .update(t.scenes)
      .set({ folder_id: folder.parent_id, updated_at: ts })
      .where(and(eq(t.scenes.owner, owner), eq(t.scenes.folder_id, id))),
    // Remove taggings for this folder.
    db
      .delete(t.taggings)
      .where(
        and(
          eq(t.taggings.target_type, "folder"),
          eq(t.taggings.target_id, id),
          eq(t.taggings.owner, owner),
        ),
      ),
    // Revoke any shares targeting this folder.
    db
      .delete(t.shares)
      .where(
        and(
          eq(t.shares.target_type, "folder"),
          eq(t.shares.target_id, id),
          eq(t.shares.owner, owner),
        ),
      ),
    db.delete(t.folders).where(and(eq(t.folders.id, id), eq(t.folders.owner, owner))),
  ]);
  return jsonResponse({ ok: true });
}

// ─── Helpers used by share authorization ───────────────────────────────
// Returns true if the scene is inside the given folder's subtree.
export async function sceneInFolderSubtree(
  env: Env,
  owner: string,
  sceneId: string,
  folderId: string,
): Promise<boolean> {
  const db = getDb(env);
  const scene = await db
    .select({ folder_id: t.scenes.folder_id })
    .from(t.scenes)
    .where(and(eq(t.scenes.id, sceneId), eq(t.scenes.owner, owner)))
    .get();
  if (!scene?.folder_id) return false;
  if (scene.folder_id === folderId) return true;
  // Walk up from scene.folder_id looking for folderId.
  const chain = await ancestorChain(env, owner, scene.folder_id);
  return chain.includes(folderId);
}

// Returns true if `childFolderId` is the same as or under `rootFolderId`.
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

// Returns the list of (id, name, parent_id) for every scene-bearing
// folder in a subtree, used by the public folder-share listing.
export async function listSubtreeFolders(
  env: Env,
  owner: string,
  rootId: string,
): Promise<FolderRow[]> {
  const db = getDb(env);
  // Use a recursive CTE to compute the subtree id set, then reselect via
  // Drizzle so the row mapping goes through the schema codec.
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
  const rows = await db
    .select()
    .from(t.folders)
    .where(and(eq(t.folders.owner, owner), inArray(t.folders.id, ids)))
    .orderBy(sql`${t.folders.name} COLLATE NOCASE`)
    .all();
  return rows;
}

// Loads scenes filtered by an explicit list of folder ids. Used both for
// recursive owner listings and folder-share public listings.
export async function loadScenesInFolders(
  env: Env,
  owner: string,
  folderIds: string[],
): Promise<SceneRow[]> {
  if (folderIds.length === 0) return [];
  const db = getDb(env);
  const rows = await db
    .select()
    .from(t.scenes)
    .where(and(eq(t.scenes.owner, owner), inArray(t.scenes.folder_id, folderIds)))
    .orderBy(desc(t.scenes.updated_at))
    .limit(1000)
    .all();
  return rows;
}
