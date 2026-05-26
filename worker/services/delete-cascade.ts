// Cross-table cascade deletes.
//
// D1 honors FKs only with `PRAGMA foreign_keys = ON` (per connection),
// which Drizzle does NOT set. So we cascade explicitly. Keeping these
// in one file makes it obvious what cleanup happens for each delete.

import { and, eq } from "drizzle-orm";
import { getDb, t } from "../db/client";
import * as filesRepo from "../db/repos/files";
import { r2FileKey, r2ThumbKey } from "../lib/responses";
import { now } from "../lib/util";
import type { Env, FolderRow } from "../types";
import { deleteAllStaticSiteAssets } from "./static-site";

// Delete one file: cascade shares + taggings, then drop the row, then
// best-effort R2 cleanup. Used by both the owner endpoint and the
// folder-share write endpoint (the share's owner is the file's owner).
export async function deleteFileCascade(env: Env, owner: string, id: string): Promise<void> {
  const db = getDb(env);
  await db.batch([
    db.delete(t.shares).where(and(eq(t.shares.target_type, "file"), eq(t.shares.target_id, id))),
    db
      .delete(t.taggings)
      .where(and(eq(t.taggings.target_type, "file"), eq(t.taggings.target_id, id))),
    db.delete(t.files).where(and(eq(t.files.id, id), eq(t.files.owner, owner))),
  ]);
  // Always drop the static-site asset prefix unconditionally: the
  // helper paginates an R2 list under `static-sites/<id>/` and no-ops
  // when there are no objects, so we don't need to branch on `kind`
  // here (kind isn't loaded at this layer anyway).
  await Promise.allSettled([
    env.R2.delete(r2FileKey(id)),
    env.R2.delete(r2ThumbKey(id)),
    deleteAllStaticSiteAssets(env, id),
  ]);
}

// Delete one folder. Children (direct files + subfolders) move up one
// level; deleting a root-level folder leaves them at the root.
// Taggings + shares targeting this folder are dropped.
export async function deleteFolderCascade(
  env: Env,
  owner: string,
  folder: FolderRow,
): Promise<void> {
  const ts = now();
  const db = getDb(env);
  await db.batch([
    db
      .update(t.folders)
      .set({ parent_id: folder.parent_id, updated_at: ts })
      .where(and(eq(t.folders.owner, owner), eq(t.folders.parent_id, folder.id))),
    db
      .update(t.files)
      .set({ folder_id: folder.parent_id, updated_at: ts })
      .where(and(eq(t.files.owner, owner), eq(t.files.folder_id, folder.id))),
    db
      .delete(t.taggings)
      .where(
        and(
          eq(t.taggings.target_type, "folder"),
          eq(t.taggings.target_id, folder.id),
          eq(t.taggings.owner, owner),
        ),
      ),
    db
      .delete(t.shares)
      .where(
        and(
          eq(t.shares.target_type, "folder"),
          eq(t.shares.target_id, folder.id),
          eq(t.shares.owner, owner),
        ),
      ),
    db.delete(t.folders).where(and(eq(t.folders.id, folder.id), eq(t.folders.owner, owner))),
  ]);
}

// Delete a user and everything they own: files (rows + R2 + thumbs),
// folders, tags + taggings, shares, and invites they created.
// Best-effort on R2: a partial failure leaves orphan objects but D1
// stays consistent.
export async function deleteUserCascade(env: Env, userId: string): Promise<void> {
  const db = getDb(env);
  const fileIds = (await filesRepo.listForOwner(env, userId)).map((r) => r.id);

  // Wipe owner-scoped rows from organization tables. Order matters
  // only for FK-honoring engines; with `PRAGMA foreign_keys = ON` D1
  // would cascade most of these. We run them explicitly so behavior
  // is the same on a connection without the pragma.
  await db.batch([
    db.delete(t.shares).where(eq(t.shares.owner, userId)),
    db.delete(t.taggings).where(eq(t.taggings.owner, userId)),
    db.delete(t.tags).where(eq(t.tags.owner, userId)),
    db.delete(t.files).where(eq(t.files.owner, userId)),
  ]);

  if (fileIds.length > 0) {
    const deletes: Promise<unknown>[] = [];
    for (const id of fileIds) {
      deletes.push(env.R2.delete(r2FileKey(id)));
      deletes.push(env.R2.delete(r2ThumbKey(id)));
      // No-op for kinds that don't have a static-site prefix.
      deletes.push(deleteAllStaticSiteAssets(env, id));
    }
    await Promise.allSettled(deletes);
  }

  // Folders go after files (folders may be referenced by files via
  // ON DELETE SET NULL; with all the user's files gone it's a clean drop).
  // Then invites created by the user, then the user row itself.
  await db.batch([
    db.delete(t.folders).where(eq(t.folders.owner, userId)),
    db.delete(t.invites).where(eq(t.invites.created_by, userId)),
    db.delete(t.users).where(eq(t.users.id, userId)),
  ]);
}
