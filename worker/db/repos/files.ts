// File repository: pure data access for `files`.

import { and, desc, eq, isNull } from "drizzle-orm";
import type { Env, FileMeta, FileRow } from "../../types";
import { getDb, t } from "../client";

export async function findById(env: Env, owner: string, id: string): Promise<FileRow | null> {
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
export async function findByIdAnyOwner(env: Env, id: string): Promise<FileRow | null> {
  const db = getDb(env);
  const row = await db.select().from(t.files).where(eq(t.files.id, id)).get();
  return row ?? null;
}

export async function listForOwner(env: Env, owner: string, limit = 1000): Promise<FileRow[]> {
  const db = getDb(env);
  return await db
    .select()
    .from(t.files)
    .where(eq(t.files.owner, owner))
    .orderBy(desc(t.files.updated_at))
    .limit(limit)
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
    .where(and(eq(t.files.owner, owner), eq(t.files.folder_id, folderId)))
    .orderBy(desc(t.files.updated_at))
    .limit(limit)
    .all();
}

export async function listAtRoot(env: Env, owner: string, limit = 1000): Promise<FileRow[]> {
  const db = getDb(env);
  return await db
    .select()
    .from(t.files)
    .where(and(eq(t.files.owner, owner), isNull(t.files.folder_id)))
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
    .where(eq(t.files.owner, owner))
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
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
