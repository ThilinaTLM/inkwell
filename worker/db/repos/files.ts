// File repository: pure data access for `files`.
//
// Every read here filters out trashed rows via `notTrashed` unless the
// function name says otherwise (`…IncludingTrashed`). Trash-aware code
// lives in `services/trash.ts`.

import { and, desc, eq, isNotNull, isNull } from "drizzle-orm";
import type { Env, FileMeta, FileRow } from "../../types";
import { getDb, t } from "../client";
import { notTrashed } from "../filters";

export { notTrashed };

export async function findById(env: Env, owner: string, id: string): Promise<FileRow | null> {
  const db = getDb(env);
  const row = await db
    .select()
    .from(t.files)
    .where(and(eq(t.files.id, id), eq(t.files.owner, owner), notTrashed(t.files)))
    .get();
  return row ?? null;
}

// Trash endpoints need to see rows regardless of `deleted_at`.
export async function findByIdIncludingTrashed(
  env: Env,
  owner: string,
  id: string,
): Promise<FileRow | null> {
  const db = getDb(env);
  const row = await db
    .select()
    .from(t.files)
    .where(and(eq(t.files.id, id), eq(t.files.owner, owner)))
    .get();
  return row ?? null;
}

// No owner filter — used by share-token reads and folder-share child
// access where the owner is determined by the share row, not the caller.
// Trashed files are invisible here, which is what makes share links to
// trashed items 404.
export async function findByIdAnyOwner(env: Env, id: string): Promise<FileRow | null> {
  const db = getDb(env);
  const row = await db
    .select()
    .from(t.files)
    .where(and(eq(t.files.id, id), notTrashed(t.files)))
    .get();
  return row ?? null;
}

export async function listForOwner(
  env: Env,
  owner: string,
  opts: { limit?: number; starred?: boolean } = {},
): Promise<FileRow[]> {
  const db = getDb(env);
  const limit = opts.limit ?? 1000;
  if (opts.starred) {
    return await db
      .select()
      .from(t.files)
      .where(and(eq(t.files.owner, owner), notTrashed(t.files), isNotNull(t.files.starred_at)))
      .orderBy(desc(t.files.starred_at))
      .limit(limit)
      .all();
  }
  return await db
    .select()
    .from(t.files)
    .where(and(eq(t.files.owner, owner), notTrashed(t.files)))
    .orderBy(desc(t.files.updated_at))
    .limit(limit)
    .all();
}

// Every file id + kind the owner has, trashed or not, uncapped. Used by
// user deletion, which must clean up R2 for everything.
export async function listAllIdsIncludingTrashed(
  env: Env,
  owner: string,
): Promise<{ id: string; kind: FileRow["kind"] }[]> {
  const db = getDb(env);
  return await db
    .select({ id: t.files.id, kind: t.files.kind })
    .from(t.files)
    .where(eq(t.files.owner, owner))
    .all();
}

export async function listInFolder(
  env: Env,
  owner: string,
  folderId: string,
  limit = 1000,
): Promise<FileRow[]> {
  const db = getDb(env);
  return await db
    .select()
    .from(t.files)
    .where(and(eq(t.files.owner, owner), eq(t.files.folder_id, folderId), notTrashed(t.files)))
    .orderBy(desc(t.files.updated_at))
    .limit(limit)
    .all();
}

export async function listAtRoot(env: Env, owner: string, limit = 1000): Promise<FileRow[]> {
  const db = getDb(env);
  return await db
    .select()
    .from(t.files)
    .where(and(eq(t.files.owner, owner), isNull(t.files.folder_id), notTrashed(t.files)))
    .orderBy(desc(t.files.updated_at))
    .limit(limit)
    .all();
}

// Rows owned by `owner` and IDs in the file id set. Used by tag/share
// filters.
export async function idsOwnedBy(env: Env, owner: string, ids: string[]): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const db = getDb(env);
  const rows = await db
    .select({ id: t.files.id })
    .from(t.files)
    .where(and(eq(t.files.owner, owner), notTrashed(t.files)))
    .all();
  const owned = new Set(rows.map((r) => r.id));
  return new Set(ids.filter((id) => owned.has(id)));
}

// ─── Mutations ───────────────────────────────────────────────────────
export async function insert(env: Env, row: FileRow): Promise<void> {
  const db = getDb(env);
  await db.insert(t.files).values(row).run();
}

export async function updateMeta(
  env: Env,
  owner: string,
  id: string,
  patch: Partial<FileRow>,
): Promise<void> {
  const db = getDb(env);
  await db
    .update(t.files)
    .set(patch)
    .where(and(eq(t.files.id, id), eq(t.files.owner, owner)))
    .run();
}

// ─── Convenience: serialize a row to FileMeta with optional extras ────
//
// This exists because most route response paths follow the same pattern:
//   1. Run a meta-mutation, 2. Fetch fresh tags + share count,
//   3. Construct a FileMeta literal with the new field values folded in.
// The route imports this helper to avoid duplicating the literal.
export function buildMeta(
  row: FileRow,
  tags: string[],
  extras: { activeShareCount?: number } = {},
): FileMeta {
  return {
    id: row.id,
    folderId: row.folder_id ?? null,
    name: row.name,
    kind: row.kind,
    tags,
    version: row.version,
    sizeBytes: row.size_bytes,
    hasThumb: row.has_thumb,
    thumbUpdatedAt: row.thumb_updated_at,
    activeShareCount: extras.activeShareCount ?? 0,
    starredAt: row.starred_at ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
