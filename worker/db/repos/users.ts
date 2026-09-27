// User repository: pure data access for `users`.
//
// No HTTP, no Response objects, no business rules. Routes/services
// compose these functions to do the higher-level work.

import { asc, eq, sql } from "drizzle-orm";
import { now } from "../../lib/util";
import type { AdminUserRow, Env, UserRow } from "../../types";
import { getDb, t } from "../client";

export async function findById(env: Env, id: string): Promise<UserRow | null> {
  const db = getDb(env);
  const row = await db.select().from(t.users).where(eq(t.users.id, id)).get();
  return row ?? null;
}

export async function findByEmail(env: Env, email: string): Promise<UserRow | null> {
  const db = getDb(env);
  const row = await db.select().from(t.users).where(eq(t.users.email, email.toLowerCase())).get();
  return row ?? null;
}

// `file_count` excludes Trash (it's what the user sees); `storage_bytes`
// includes it (trashed blobs still occupy R2 until purged).
// Correlated subqueries: drizzle renders `${column}` without a table
// prefix inside raw sql, so `${t.users.id}` would resolve to `files.id`
// here. Qualify both sides explicitly.
const fileCountSql = sql<number>`COALESCE((SELECT COUNT(*) FROM files f WHERE f.owner = users.id AND f.deleted_at IS NULL), 0)`;
const storageBytesSql = sql<number>`COALESCE((SELECT SUM(f.size_bytes) FROM files f WHERE f.owner = users.id), 0)`;

// Admin list: every user with their owned-file count and storage use.
export async function listAllAdmin(env: Env): Promise<AdminUserRow[]> {
  const db = getDb(env);
  const rows = await db
    .select({
      id: t.users.id,
      email: t.users.email,
      password_hash: t.users.password_hash,
      first_name: t.users.first_name,
      last_name: t.users.last_name,
      is_admin: t.users.is_admin,
      disabled: t.users.disabled,
      created_at: t.users.created_at,
      updated_at: t.users.updated_at,
      last_login_at: t.users.last_login_at,
      file_count: fileCountSql,
      storage_bytes: storageBytesSql,
    })
    .from(t.users)
    .orderBy(asc(t.users.created_at))
    .all();
  return rows;
}

export async function findByIdAdmin(env: Env, id: string): Promise<AdminUserRow | null> {
  const db = getDb(env);
  const row = await db
    .select({
      id: t.users.id,
      email: t.users.email,
      password_hash: t.users.password_hash,
      first_name: t.users.first_name,
      last_name: t.users.last_name,
      is_admin: t.users.is_admin,
      disabled: t.users.disabled,
      created_at: t.users.created_at,
      updated_at: t.users.updated_at,
      last_login_at: t.users.last_login_at,
      file_count: fileCountSql,
      storage_bytes: storageBytesSql,
    })
    .from(t.users)
    .where(eq(t.users.id, id))
    .get();
  return row ?? null;
}

// Public-facing display name for share pages ("Shared by …"). Never
// exposes the email; returns null when the user is gone or has no name.
export async function displayName(
  env: Env,
  id: string,
): Promise<{ firstName: string; lastName: string } | null> {
  const db = getDb(env);
  const row = await db
    .select({ firstName: t.users.first_name, lastName: t.users.last_name })
    .from(t.users)
    .where(eq(t.users.id, id))
    .get();
  if (!row) return null;
  const firstName = row.firstName.trim();
  const lastName = row.lastName.trim();
  if (!firstName && !lastName) return null;
  return { firstName, lastName };
}

export async function insert(env: Env, row: UserRow): Promise<void> {
  const db = getDb(env);
  await db.insert(t.users).values(row).run();
}

export async function update(env: Env, id: string, patch: Partial<UserRow>): Promise<void> {
  const db = getDb(env);
  await db.update(t.users).set(patch).where(eq(t.users.id, id)).run();
}

export async function bumpLastLogin(env: Env, id: string): Promise<number> {
  const ts = now();
  const db = getDb(env);
  await db.update(t.users).set({ last_login_at: ts }).where(eq(t.users.id, id)).run();
  return ts;
}

export async function deleteById(env: Env, id: string): Promise<void> {
  const db = getDb(env);
  await db.delete(t.users).where(eq(t.users.id, id)).run();
}

export async function existsById(env: Env, id: string): Promise<boolean> {
  const db = getDb(env);
  const row = await db.select({ id: t.users.id }).from(t.users).where(eq(t.users.id, id)).get();
  return !!row;
}
