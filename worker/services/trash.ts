// Trash: soft delete, restore, and permanent purge.
//
// Model (see migration 0003):
//   * `deleted_at` NULL = live. Every normal read filters on it
//     (`db/filters.ts#notTrashed`), so trashed items — and anything that
//     points at them, like share links — disappear everywhere except here.
//   * Trashing a folder marks its whole *live* subtree with
//     `trashed_via = <folder id>`; the folder itself keeps
//     `trashed_via = NULL`, which is what makes it a top-level Trash row.
//     Rows already in Trash (trashed on their own earlier) keep their own
//     `deleted_at`/`trashed_via` and stay separate Trash entries.
//   * Restore clears the item plus every row with `trashed_via = id`. If
//     the original parent is gone or still trashed, the item goes to the
//     root (`relocatedToRoot`) — we never recreate the path.
//   * Purge deletes the item and its trashed-with cohort for real. Order:
//     collect file ids → R2 cleanup → detach anything else still pointing
//     into the purged folders (separately-trashed descendants) → drop
//     taggings + shares → delete files → delete folders. The detach step
//     matters because `folders.parent_id` is `ON DELETE CASCADE` and D1
//     enforces FKs: without it, deleting a folder would silently delete a
//     separately-trashed subfolder row *without* its R2 cleanup.
//
// Callers (routes) are responsible for ownership checks, validating
// state (live vs trashed) and ancestor de-duplication where relevant.
// All id lists are bound as a single JSON parameter (`json_each`) so a
// 500-item batch stays within D1's bound-parameter limit, and each
// operation's D1 writes run as one `db.batch` (a single transaction).

import { and, eq, isNotNull, isNull, lte, type SQL, sql } from "drizzle-orm";
import { type BatchStatement, type DB, getDb, runBatch, t } from "../db/client";
import { inIds } from "../db/filters";
import {
  childrenMap,
  type ItemRef,
  locationPath,
  type ParentMap,
  purgeAtFor,
  purgeCutoff,
} from "../lib/items";
import { now } from "../lib/util";
import type { Env, FileKind, RestoredItemPublic, TrashItemPublic } from "../types";
import { deleteFileObjects } from "./delete-cascade";

function split(refs: readonly ItemRef[]): { fileIds: string[]; folderIds: string[] } {
  return {
    fileIds: refs.filter((r) => r.type === "file").map((r) => r.id),
    folderIds: refs.filter((r) => r.type === "folder").map((r) => r.id),
  };
}

interface FolderLite {
  id: string;
  parent_id: string | null;
  name: string;
  deleted_at: number | null;
  trashed_via: string | null;
}

// Every folder the owner has, trashed or not. Trash needs the whole tree
// to build original paths and to decide where restored items land.
async function loadAllFolders(db: DB, owner: string): Promise<FolderLite[]> {
  return await db
    .select({
      id: t.folders.id,
      parent_id: t.folders.parent_id,
      name: t.folders.name,
      deleted_at: t.folders.deleted_at,
      trashed_via: t.folders.trashed_via,
    })
    .from(t.folders)
    .where(eq(t.folders.owner, owner))
    .all();
}

// ─── Trash ───────────────────────────────────────────────────────────
/**
 * Soft-delete `refs` (all live, owned, and ancestor-deduped by the
 * caller). Folder refs take their live subtree with them.
 */
export async function trashItems(env: Env, owner: string, refs: readonly ItemRef[]): Promise<void> {
  if (refs.length === 0) return;
  const db = getDb(env);
  const ts = now();
  const { fileIds, folderIds } = split(refs);
  const stmts: BatchStatement[] = [];

  if (folderIds.length > 0) {
    // `down(id, root)`: every live folder under each trashed root,
    // tagged with the root it belongs to. The walk stops at rows that
    // are already trashed — they keep their own trash entry.
    const down = sql`WITH RECURSIVE down(id, root) AS (
      SELECT id, id FROM folders
      WHERE owner = ${owner} AND deleted_at IS NULL
        AND id IN (SELECT value FROM json_each(${JSON.stringify(folderIds)}))
      UNION ALL
      SELECT f.id, down.root FROM folders f JOIN down ON f.parent_id = down.id
      WHERE f.owner = ${owner} AND f.deleted_at IS NULL
    )`;
    // Order matters: files first, then descendant folders, then the
    // roots — each CTE re-walks *live* folders, so marking folders
    // before their files would hide the files from the walk.
    stmts.push(
      sql`${down}
        UPDATE files SET deleted_at = ${ts},
          trashed_via = (SELECT root FROM down WHERE down.id = files.folder_id)
        WHERE owner = ${owner} AND deleted_at IS NULL
          AND folder_id IN (SELECT id FROM down)`,
      sql`${down}
        UPDATE folders SET deleted_at = ${ts},
          trashed_via = (SELECT root FROM down WHERE down.id = folders.id)
        WHERE owner = ${owner} AND deleted_at IS NULL
          AND id IN (SELECT id FROM down WHERE id <> root)`,
      db
        .update(t.folders)
        .set({ deleted_at: ts, trashed_via: null })
        .where(
          and(
            eq(t.folders.owner, owner),
            isNull(t.folders.deleted_at),
            inIds(t.folders.id, folderIds),
          ),
        ),
    );
  }
  if (fileIds.length > 0) {
    stmts.push(
      db
        .update(t.files)
        .set({ deleted_at: ts, trashed_via: null })
        .where(
          and(eq(t.files.owner, owner), isNull(t.files.deleted_at), inIds(t.files.id, fileIds)),
        ),
    );
  }
  await runBatch(env, stmts);
}

// ─── Restore ─────────────────────────────────────────────────────────
/**
 * Restore top-level trashed items. `refs` must be owned, trashed, and
 * top-level (`trashed_via IS NULL`); `parents` maps each ref id to its
 * stored parent (`folder_id` / `parent_id`).
 *
 * A parent counts as available if it is live now, or becomes live in
 * this same batch (it is itself restored, or was trashed along with a
 * restored folder). Otherwise the item is relocated to the root.
 */
export async function restoreItems(
  env: Env,
  owner: string,
  refs: readonly ItemRef[],
  parents: ReadonlyMap<string, string | null>,
): Promise<RestoredItemPublic[]> {
  if (refs.length === 0) return [];
  const db = getDb(env);
  const { fileIds, folderIds } = split(refs);
  const restoring = new Set(folderIds);
  const byId = new Map((await loadAllFolders(db, owner)).map((f) => [f.id, f]));

  const liveAfter = (id: string): boolean => {
    const f = byId.get(id);
    if (!f) return false;
    if (f.deleted_at === null) return true;
    if (restoring.has(id)) return true;
    return f.trashed_via !== null && restoring.has(f.trashed_via);
  };

  const out: RestoredItemPublic[] = [];
  const relocatedFiles: string[] = [];
  const relocatedFolders: string[] = [];
  for (const r of refs) {
    const parent = parents.get(r.id) ?? null;
    const relocate = parent !== null && !liveAfter(parent);
    if (relocate) (r.type === "file" ? relocatedFiles : relocatedFolders).push(r.id);
    out.push({
      type: r.type,
      id: r.id,
      parentId: relocate ? null : parent,
      relocatedToRoot: relocate,
    });
  }

  const cleared = { deleted_at: null, trashed_via: null };
  const stmts: BatchStatement[] = [];
  if (folderIds.length > 0) {
    stmts.push(
      // The cohorts that were trashed along with each folder…
      db
        .update(t.files)
        .set(cleared)
        .where(and(eq(t.files.owner, owner), inIds(t.files.trashed_via, folderIds))),
      db
        .update(t.folders)
        .set(cleared)
        .where(and(eq(t.folders.owner, owner), inIds(t.folders.trashed_via, folderIds))),
      // …and the folders themselves.
      db
        .update(t.folders)
        .set(cleared)
        .where(and(eq(t.folders.owner, owner), inIds(t.folders.id, folderIds))),
    );
  }
  if (fileIds.length > 0) {
    stmts.push(
      db
        .update(t.files)
        .set(cleared)
        .where(and(eq(t.files.owner, owner), inIds(t.files.id, fileIds))),
    );
  }
  if (relocatedFolders.length > 0) {
    stmts.push(
      db
        .update(t.folders)
        .set({ parent_id: null })
        .where(and(eq(t.folders.owner, owner), inIds(t.folders.id, relocatedFolders))),
    );
  }
  if (relocatedFiles.length > 0) {
    stmts.push(
      db
        .update(t.files)
        .set({ folder_id: null })
        .where(and(eq(t.files.owner, owner), inIds(t.files.id, relocatedFiles))),
    );
  }
  await runBatch(env, stmts);
  return out;
}

// ─── Purge ───────────────────────────────────────────────────────────
/**
 * Permanently delete trashed items (any trashed row, top-level or not)
 * plus, for folders, the cohort that was trashed along with them.
 * Returns the number of D1 rows (files + folders) removed.
 *
 * No ancestor de-duplication here on purpose: a separately-trashed
 * subfolder of a purged folder is its own Trash entry, and when both are
 * in the batch both must go.
 */
export async function purgeItems(
  env: Env,
  owner: string,
  refs: readonly ItemRef[],
): Promise<number> {
  if (refs.length === 0) return 0;
  const db = getDb(env);
  const { fileIds, folderIds } = split(refs);

  // 1. Collect everything to delete. Folder cohorts are walked in memory
  //    over the owner's full tree: from each root, descend into children
  //    that were trashed with the same operation (same cohort key).
  const delFolders = new Set<string>();
  const cohortKeyOf = new Map<string, string>(); // purged folder → cohort key
  if (folderIds.length > 0) {
    const all = await loadAllFolders(db, owner);
    const byId = new Map(all.map((f) => [f.id, f]));
    const children = childrenMap(new Map(all.map((f) => [f.id, f.parent_id])) as ParentMap);
    for (const rootId of folderIds) {
      const root = byId.get(rootId);
      if (!root || root.deleted_at === null) continue;
      const key = root.trashed_via ?? root.id;
      const stack = [rootId];
      while (stack.length > 0) {
        const id = stack.pop();
        if (id === undefined || delFolders.has(id)) continue;
        delFolders.add(id);
        cohortKeyOf.set(id, key);
        for (const c of children.get(id) ?? []) {
          const child = byId.get(c);
          if (child && child.deleted_at !== null && child.trashed_via === key) stack.push(c);
        }
      }
    }
  }

  const delFiles = new Map<string, FileKind>();
  if (fileIds.length > 0) {
    const rows = await db
      .select({ id: t.files.id, kind: t.files.kind })
      .from(t.files)
      .where(
        and(eq(t.files.owner, owner), isNotNull(t.files.deleted_at), inIds(t.files.id, fileIds)),
      )
      .all();
    for (const r of rows) delFiles.set(r.id, r.kind);
  }
  if (delFolders.size > 0) {
    const rows = await db
      .select({
        id: t.files.id,
        kind: t.files.kind,
        folder_id: t.files.folder_id,
        trashed_via: t.files.trashed_via,
      })
      .from(t.files)
      .where(
        and(
          eq(t.files.owner, owner),
          isNotNull(t.files.deleted_at),
          inIds(t.files.folder_id, [...delFolders]),
        ),
      )
      .all();
    for (const r of rows) {
      const key = r.folder_id ? cohortKeyOf.get(r.folder_id) : undefined;
      if (key !== undefined && r.trashed_via === key) delFiles.set(r.id, r.kind);
    }
  }
  if (delFiles.size === 0 && delFolders.size === 0) return 0;

  // 2. R2 first: if the D1 batch below then fails, the rows are still in
  //    Trash and a retry cleans up; the reverse order could orphan blobs.
  await deleteFileObjects(
    env,
    [...delFiles].map(([id, kind]) => ({ id, kind })),
  );

  // 3–5. One transaction: detach survivors, drop dependents, delete rows.
  const fIds = [...delFiles.keys()];
  const dIds = [...delFolders];
  const stmts: BatchStatement[] = [];
  if (dIds.length > 0) {
    stmts.push(
      // Separately-trashed descendants (and, defensively, anything else
      // still inside) move to the root instead of being cascaded away.
      db
        .update(t.folders)
        .set({ parent_id: null })
        .where(
          and(
            eq(t.folders.owner, owner),
            inIds(t.folders.parent_id, dIds),
            sql`NOT (${inIds(t.folders.id, dIds)})`,
          ),
        ),
      db
        .update(t.files)
        .set({ folder_id: null })
        .where(
          and(
            eq(t.files.owner, owner),
            inIds(t.files.folder_id, dIds),
            sql`NOT (${inIds(t.files.id, fIds)})`,
          ),
        ),
    );
  }
  const targets: SQL[] = [];
  if (fIds.length > 0) targets.push(sql`(target_type = 'file' AND ${inIds(sql`target_id`, fIds)})`);
  if (dIds.length > 0) {
    targets.push(sql`(target_type = 'folder' AND ${inIds(sql`target_id`, dIds)})`);
  }
  const anyTarget = sql.join(targets, sql` OR `);
  stmts.push(
    sql`DELETE FROM taggings WHERE owner = ${owner} AND (${anyTarget})`,
    sql`DELETE FROM shares WHERE owner = ${owner} AND (${anyTarget})`,
    // GC tags left without any tagging (same rule as tag replacement).
    db
      .delete(t.tags)
      .where(
        and(
          eq(t.tags.owner, owner),
          sql`${t.tags.id} NOT IN (SELECT DISTINCT ${t.taggings.tag_id} FROM ${t.taggings} WHERE ${t.taggings.owner} = ${owner})`,
        ),
      ),
  );
  if (fIds.length > 0) {
    stmts.push(db.delete(t.files).where(and(eq(t.files.owner, owner), inIds(t.files.id, fIds))));
  }
  if (dIds.length > 0) {
    stmts.push(
      db.delete(t.folders).where(and(eq(t.folders.owner, owner), inIds(t.folders.id, dIds))),
    );
  }
  await runBatch(env, stmts);
  return fIds.length + dIds.length;
}

// ─── Listing ─────────────────────────────────────────────────────────
/** Top-level Trash rows (descendants travel with their folder), newest
 *  first. */
export async function listTrash(env: Env, owner: string): Promise<TrashItemPublic[]> {
  const db = getDb(env);
  const [folders, trashedFiles] = await Promise.all([
    loadAllFolders(db, owner),
    db
      .select({
        id: t.files.id,
        name: t.files.name,
        kind: t.files.kind,
        folder_id: t.files.folder_id,
        size_bytes: t.files.size_bytes,
        deleted_at: t.files.deleted_at,
        trashed_via: t.files.trashed_via,
      })
      .from(t.files)
      .where(and(eq(t.files.owner, owner), isNotNull(t.files.deleted_at)))
      .all(),
  ]);

  const parentOf: ParentMap = new Map(folders.map((f) => [f.id, f.parent_id]));
  const nameOf = new Map(folders.map((f) => [f.id, f.name]));

  // Per-root cohort sizes.
  const count = new Map<string, number>();
  const bytes = new Map<string, number>();
  for (const f of folders) {
    if (f.deleted_at !== null && f.trashed_via) {
      count.set(f.trashed_via, (count.get(f.trashed_via) ?? 0) + 1);
    }
  }
  for (const f of trashedFiles) {
    if (!f.trashed_via) continue;
    count.set(f.trashed_via, (count.get(f.trashed_via) ?? 0) + 1);
    bytes.set(f.trashed_via, (bytes.get(f.trashed_via) ?? 0) + f.size_bytes);
  }

  const out: TrashItemPublic[] = [];
  for (const f of folders) {
    if (f.deleted_at === null || f.trashed_via !== null) continue;
    out.push({
      type: "folder",
      id: f.id,
      name: f.name,
      originalPath: locationPath(parentOf, nameOf, f.parent_id),
      originalParentId: f.parent_id,
      deletedAt: f.deleted_at,
      purgeAt: purgeAtFor(f.deleted_at),
      itemCount: count.get(f.id) ?? 0,
      sizeBytes: bytes.get(f.id) ?? 0,
    });
  }
  for (const f of trashedFiles) {
    if (f.deleted_at === null || f.trashed_via !== null) continue;
    out.push({
      type: "file",
      id: f.id,
      name: f.name,
      kind: f.kind,
      originalPath: locationPath(parentOf, nameOf, f.folder_id),
      originalParentId: f.folder_id,
      deletedAt: f.deleted_at,
      purgeAt: purgeAtFor(f.deleted_at),
      sizeBytes: f.size_bytes,
    });
  }
  out.sort((a, b) => b.deletedAt - a.deletedAt);
  return out;
}

async function topLevelTrashRefs(
  db: DB,
  where: { owner?: string; deletedBefore?: number },
  limit?: number,
): Promise<(ItemRef & { owner: string })[]> {
  const cond = (table: typeof t.files | typeof t.folders) =>
    and(
      isNotNull(table.deleted_at),
      isNull(table.trashed_via),
      where.owner !== undefined ? eq(table.owner, where.owner) : undefined,
      where.deletedBefore !== undefined ? lte(table.deleted_at, where.deletedBefore) : undefined,
    );
  const q = (table: typeof t.files | typeof t.folders) => {
    const base = db.select({ id: table.id, owner: table.owner }).from(table).where(cond(table));
    return limit !== undefined ? base.limit(limit).all() : base.all();
  };
  const [folders, files] = await Promise.all([q(t.folders), q(t.files)]);
  return [
    ...folders.map((r) => ({ type: "folder" as const, id: r.id, owner: r.owner })),
    ...files.map((r) => ({ type: "file" as const, id: r.id, owner: r.owner })),
  ];
}

/** "Empty trash": purge every top-level Trash row. Returns how many
 *  Trash entries were removed. */
export async function emptyTrash(env: Env, owner: string): Promise<number> {
  const db = getDb(env);
  const refs = await topLevelTrashRefs(db, { owner });
  await purgeItems(env, owner, refs);
  return refs.length;
}

// Upper bound on Trash entries purged per cron run, per table. Keeps one
// invocation well inside the Worker CPU / subrequest budget; anything
// left over is picked up by the next daily run.
const PURGE_BATCH_LIMIT = 200;

/** Daily cron: purge top-level Trash rows older than the retention
 *  window, across all users. Returns the number of entries purged. */
export async function purgeExpired(env: Env, nowMs: number): Promise<number> {
  const db = getDb(env);
  const due = await topLevelTrashRefs(db, { deletedBefore: purgeCutoff(nowMs) }, PURGE_BATCH_LIMIT);
  const byOwner = new Map<string, ItemRef[]>();
  for (const r of due) {
    const arr = byOwner.get(r.owner) ?? [];
    arr.push({ type: r.type, id: r.id });
    byOwner.set(r.owner, arr);
  }
  let purged = 0;
  for (const [owner, refs] of byOwner) {
    try {
      await purgeItems(env, owner, refs);
      purged += refs.length;
    } catch (e) {
      // One owner's failure must not block everyone else's purge.
      console.error("purgeExpired: owner purge failed", owner, e);
    }
  }
  return purged;
}
