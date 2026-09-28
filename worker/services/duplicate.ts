// Duplicate files and folders (`POST /api/items/duplicate`).
//
// A file copy is a new D1 row (same kind/size, tags copied, never
// starred/shared) plus copies of every R2 object the source owns: the
// blob (`scenes/{id}.json`), the thumbnail, and for static sites every
// asset under `static-sites/{id}/`. A folder copy recreates the live
// subtree depth-first with the same names inside; only the top-level
// copies get a "(copy)" name (see `lib/items.ts#copyName`), unique among
// siblings of the same type in the destination folder.
//
// Order: plan everything in memory → copy R2 objects → insert all D1
// rows in one `db.batch`. If the batch fails, the freshly written R2
// objects are removed again so nothing is orphaned.

import { and, eq, sql } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import { type DB, getDb, t } from "../db/client";
import { chunk, inIds, notTrashed } from "../db/filters";
import * as foldersRepo from "../db/repos/folders";
import { MAX_DEPTH } from "../db/repos/folders";
import { newId } from "../lib/crypto";
import {
  checkFolderMove,
  childrenMap,
  copyName,
  type ItemRef,
  MAX_BULK_ITEMS,
  subtreeIds,
} from "../lib/items";
import { r2FileKey, r2ThumbKey } from "../lib/responses";
import { now } from "../lib/util";
import type {
  Env,
  ExcalidrawFileBlob,
  FileMeta,
  FilePreview,
  FileRow,
  FolderMeta,
  FolderRow,
} from "../types";
import { rowToFolderMeta, rowToMeta } from "../types";
import { deleteFileObjects } from "./delete-cascade";
import { r2StaticSitePrefix } from "./static-site";

type SqliteBatchItem = BatchItem<"sqlite">;

/** Most files a single duplicate request may copy (recursively). */
export const MAX_DUPLICATE_FILES = MAX_BULK_ITEMS;

// R2 fan-out per request. Keeps a big folder copy fast without
// stampeding the bucket or the Worker's concurrent-subrequest limit.
const R2_CONCURRENCY = 6;

export class DuplicateError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export interface DuplicateResult {
  files: FileMeta[];
  folders: FolderMeta[];
}

/**
 * Duplicate `refs` (live, owned, ancestor-deduped by the caller) into
 * `targetFolderId` — `undefined` means "next to each original", `null`
 * the root. The target, when given, must already be validated as a live
 * folder of `owner`. Throws `DuplicateError` for 409 (folder into its own
 * subtree), 400 (depth) and 413 (too many files).
 */
export async function duplicateItems(
  env: Env,
  owner: string,
  refs: readonly ItemRef[],
  sourceFiles: ReadonlyMap<string, FileRow>,
  targetFolderId: string | null | undefined,
): Promise<DuplicateResult> {
  const db = getDb(env);
  const ts = now();

  const liveFolders = await foldersRepo.listForOwner(env, owner);
  const folderById = new Map(liveFolders.map((f) => [f.id, f]));
  const parentOf = new Map(liveFolders.map((f) => [f.id, f.parent_id]));
  const children = childrenMap(parentOf);

  const destOf = (sourceParent: string | null): string | null =>
    targetFolderId === undefined ? sourceParent : targetFolderId;

  // ── Validate folder destinations and collect subtrees ──
  const folderRefs = refs.filter((r) => r.type === "folder");
  const subtrees = new Map<string, string[]>();
  for (const r of folderRefs) {
    const src = folderById.get(r.id);
    if (!src) throw new DuplicateError(404, "folder not found");
    const problem = checkFolderMove(parentOf, r.id, destOf(src.parent_id), MAX_DEPTH);
    if (problem === "cycle") throw new DuplicateError(409, "cannot copy a folder into itself");
    if (problem === "depth") throw new DuplicateError(400, `max nesting depth is ${MAX_DEPTH}`);
    subtrees.set(r.id, subtreeIds(children, r.id));
  }

  // ── Load the live files inside every copied subtree (capped) ──
  const allSubtreeFolders = [...subtrees.values()].flat();
  const directFiles = refs.filter((r) => r.type === "file");
  let nestedFiles: FileRow[] = [];
  if (allSubtreeFolders.length > 0) {
    nestedFiles = await db
      .select()
      .from(t.files)
      .where(
        and(
          eq(t.files.owner, owner),
          inIds(t.files.folder_id, allSubtreeFolders),
          notTrashed(t.files),
        ),
      )
      .limit(MAX_DUPLICATE_FILES + 1)
      .all();
  }
  if (directFiles.length + nestedFiles.length > MAX_DUPLICATE_FILES) {
    throw new DuplicateError(
      413,
      `cannot duplicate more than ${MAX_DUPLICATE_FILES} files at once`,
    );
  }

  // ── Names already used in each destination (per item type) ──
  const takenFolderNames = new Map<string | null, Set<string>>();
  const takenFileNames = new Map<string | null, Set<string>>();
  const destinations = new Set<string | null>();
  for (const r of refs) {
    const parent =
      r.type === "file"
        ? (sourceFiles.get(r.id)?.folder_id ?? null)
        : (folderById.get(r.id)?.parent_id ?? null);
    destinations.add(destOf(parent));
  }
  for (const dest of destinations) {
    takenFolderNames.set(
      dest,
      new Set(liveFolders.filter((f) => f.parent_id === dest).map((f) => f.name)),
    );
    takenFileNames.set(dest, await fileNamesIn(db, owner, dest));
  }
  const claim = (taken: Map<string | null, Set<string>>, dest: string | null, name: string) => {
    const set = taken.get(dest) ?? new Set<string>();
    const next = copyName(name, set);
    set.add(next);
    taken.set(dest, set);
    return next;
  };

  // ── Plan the new rows ──
  const newFolders: FolderRow[] = [];
  const folderIdMap = new Map<string, string>(); // source → copy
  for (const r of folderRefs) {
    const ids = subtrees.get(r.id) ?? [];
    // `subtreeIds` is a DFS from the root, so every parent precedes its
    // children — required for the FK on `folders.parent_id` at insert.
    for (const srcId of ids) {
      const src = folderById.get(srcId);
      if (!src) continue;
      const id = newId();
      folderIdMap.set(srcId, id);
      const isRoot = srcId === r.id;
      const dest = destOf(src.parent_id);
      newFolders.push({
        id,
        owner,
        parent_id: isRoot ? dest : (folderIdMap.get(src.parent_id ?? "") ?? null),
        name: isRoot ? claim(takenFolderNames, dest, src.name) : src.name,
        created_at: ts,
        updated_at: ts,
        deleted_at: null,
        trashed_via: null,
        starred_at: null,
      });
    }
  }

  interface FilePlan {
    src: FileRow;
    row: FileRow;
  }
  const plans: FilePlan[] = [];
  const planFile = (src: FileRow, folderId: string | null, name: string) => {
    plans.push({
      src,
      row: {
        ...src,
        id: newId(),
        folder_id: folderId,
        name,
        version: 1,
        thumb_updated_at: src.has_thumb ? ts : 0,
        created_at: ts,
        updated_at: ts,
        deleted_at: null,
        trashed_via: null,
        starred_at: null,
      },
    });
  };
  for (const r of directFiles) {
    const src = sourceFiles.get(r.id);
    if (!src) throw new DuplicateError(404, "file not found");
    const dest = destOf(src.folder_id);
    planFile(src, dest, claim(takenFileNames, dest, src.name));
  }
  for (const src of nestedFiles) {
    planFile(src, folderIdMap.get(src.folder_id ?? "") ?? null, src.name);
  }

  // ── Copy R2 objects ──
  const written: FilePlan[] = [];
  try {
    await mapLimit(plans, R2_CONCURRENCY, async (p) => {
      written.push(p);
      await copyFileObjects(env, p);
    });
  } catch (e) {
    await deleteFileObjects(
      env,
      written.map((p) => ({ id: p.row.id, kind: p.row.kind })),
    );
    throw e;
  }

  // ── Tags ──
  const srcFolderIds = [...folderIdMap.keys()];
  const srcFileIds = plans.map((p) => p.src.id);
  const tagRows = await loadTaggings(db, owner, srcFileIds, srcFolderIds);
  const fileIdMap = new Map(plans.map((p) => [p.src.id, p.row.id]));
  const newTaggings = tagRows.flatMap((tg) => {
    const target =
      tg.target_type === "file" ? fileIdMap.get(tg.target_id) : folderIdMap.get(tg.target_id);
    return target
      ? [
          {
            tag_id: tg.tag_id,
            target_type: tg.target_type,
            target_id: target,
            owner,
            created_at: ts,
          },
        ]
      : [];
  });

  // ── One D1 transaction for all rows ──
  // Multi-row INSERTs chunked to stay under D1's 100-bound-parameter cap.
  const stmts: SqliteBatchItem[] = [
    ...chunk(newFolders, 10).map((rows) => db.insert(t.folders).values(rows)),
    ...chunk(
      plans.map((p) => p.row),
      6,
    ).map((rows) => db.insert(t.files).values(rows)),
    ...chunk(newTaggings, 18).map((rows) => db.insert(t.taggings).values(rows)),
  ];
  try {
    if (stmts.length > 0) await db.batch(stmts as [SqliteBatchItem, ...SqliteBatchItem[]]);
  } catch (e) {
    await deleteFileObjects(
      env,
      plans.map((p) => ({ id: p.row.id, kind: p.row.kind })),
    );
    throw e;
  }

  // ── Response ──
  const tagsFor = new Map<string, string[]>();
  for (const tg of tagRows) {
    const target =
      tg.target_type === "file" ? fileIdMap.get(tg.target_id) : folderIdMap.get(tg.target_id);
    if (!target) continue;
    const arr = tagsFor.get(target);
    if (arr) arr.push(tg.name);
    else tagsFor.set(target, [tg.name]);
  }
  const fileCount = new Map<string, number>();
  const previews = new Map<string, FilePreview[]>();
  // Previews mirror the source folder's stack: newest source first.
  const byRecency = [...plans].sort((a, b) => b.src.updated_at - a.src.updated_at);
  for (const p of byRecency) {
    const fid = p.row.folder_id;
    if (!fid) continue;
    fileCount.set(fid, (fileCount.get(fid) ?? 0) + 1);
    const arr = previews.get(fid) ?? [];
    if (arr.length < 3) {
      arr.push({
        id: p.row.id,
        kind: p.row.kind,
        hasThumb: p.row.has_thumb,
        thumbUpdatedAt: p.row.thumb_updated_at,
      });
      previews.set(fid, arr);
    }
  }
  const subCount = new Map<string, number>();
  for (const f of newFolders) {
    if (f.parent_id) subCount.set(f.parent_id, (subCount.get(f.parent_id) ?? 0) + 1);
  }

  return {
    files: plans.map((p) => rowToMeta(p.row, tagsFor.get(p.row.id) ?? [])),
    folders: newFolders.map((f) =>
      rowToFolderMeta(f, {
        tags: tagsFor.get(f.id) ?? [],
        fileCount: fileCount.get(f.id) ?? 0,
        subfolderCount: subCount.get(f.id) ?? 0,
        previews: previews.get(f.id) ?? [],
      }),
    ),
  };
}

async function fileNamesIn(db: DB, owner: string, folderId: string | null): Promise<Set<string>> {
  const rows = await db
    .select({ name: t.files.name })
    .from(t.files)
    .where(
      and(
        eq(t.files.owner, owner),
        folderId === null ? sql`${t.files.folder_id} IS NULL` : eq(t.files.folder_id, folderId),
        notTrashed(t.files),
      ),
    )
    .all();
  return new Set(rows.map((r) => r.name));
}

async function loadTaggings(
  db: DB,
  owner: string,
  fileIds: string[],
  folderIds: string[],
): Promise<{ tag_id: string; target_type: "file" | "folder"; target_id: string; name: string }[]> {
  if (fileIds.length === 0 && folderIds.length === 0) return [];
  return await db
    .select({
      tag_id: t.taggings.tag_id,
      target_type: t.taggings.target_type,
      target_id: t.taggings.target_id,
      name: t.tags.name,
    })
    .from(t.taggings)
    .innerJoin(t.tags, eq(t.tags.id, t.taggings.tag_id))
    .where(
      and(
        eq(t.taggings.owner, owner),
        sql`((${t.taggings.target_type} = 'file' AND ${inIds(t.taggings.target_id, fileIds)})
          OR (${t.taggings.target_type} = 'folder' AND ${inIds(t.taggings.target_id, folderIds)}))`,
      ),
    )
    .orderBy(sql`${t.tags.name} COLLATE NOCASE`)
    .all();
}

// Copy every R2 object of one file. Mutates `p.row` with the actual
// blob size (excalidraw blobs are rewritten) and thumb presence.
async function copyFileObjects(env: Env, p: { src: FileRow; row: FileRow }): Promise<void> {
  const { src, row } = p;
  const blob = await env.R2.get(r2FileKey(src.id));
  if (!blob) throw new DuplicateError(500, `blob missing for "${src.name}"`);
  if (src.kind === "excalidraw") {
    // Mirror the (possibly new) name into `appState.name`, exactly like
    // rename does (`mirrorRenameIntoExcalidrawBlob`), so export dialogs
    // and downloads of the copy carry the copy's name.
    const text = await blob.text();
    let out = text;
    try {
      const parsed = JSON.parse(text) as ExcalidrawFileBlob;
      out = JSON.stringify({ ...parsed, appState: { ...(parsed.appState ?? {}), name: row.name } });
    } catch {
      // Unparseable blob: copy verbatim; the D1 row stays canonical.
    }
    const bytes = new TextEncoder().encode(out);
    await env.R2.put(r2FileKey(row.id), bytes, {
      httpMetadata: { contentType: "application/json" },
    });
    row.size_bytes = bytes.byteLength;
  } else {
    await env.R2.put(r2FileKey(row.id), blob.body, { httpMetadata: blob.httpMetadata });
  }

  if (src.has_thumb) {
    const thumb = await env.R2.get(r2ThumbKey(src.id));
    if (thumb) {
      await env.R2.put(r2ThumbKey(row.id), thumb.body, { httpMetadata: thumb.httpMetadata });
    } else {
      row.has_thumb = false;
      row.thumb_updated_at = 0;
    }
  }

  if (src.kind === "static-site") {
    const fromPrefix = r2StaticSitePrefix(src.id);
    const toPrefix = r2StaticSitePrefix(row.id);
    let cursor: string | undefined;
    do {
      const list = await env.R2.list({ prefix: fromPrefix, cursor, limit: 1000 });
      for (const o of list.objects) {
        const obj = await env.R2.get(o.key);
        if (!obj) continue;
        await env.R2.put(toPrefix + o.key.slice(fromPrefix.length), obj.body, {
          httpMetadata: obj.httpMetadata,
        });
      }
      cursor = list.truncated ? list.cursor : undefined;
    } while (cursor);
  }
}

// Run `fn` over `items` with at most `limit` in flight; rejects on the
// first failure (after in-flight tasks settle).
async function mapLimit<T>(
  items: readonly T[],
  limit: number,
  fn: (item: T) => Promise<void>,
): Promise<void> {
  let next = 0;
  let failed: unknown = null;
  const worker = async () => {
    while (failed === null && next < items.length) {
      const item = items[next++];
      try {
        await fn(item);
      } catch (e) {
        failed ??= e;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  if (failed !== null) throw failed;
}
