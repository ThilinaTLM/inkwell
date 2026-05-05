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

// Admin list: every user with their owned-file count.
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
      file_count: sql<number>`COALESCE((SELECT COUNT(*) FROM ${t.files} WHERE ${t.files.owner} = ${t.users.id}), 0)`,
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
      file_count: sql<number>`COALESCE((SELECT COUNT(*) FROM ${t.files} WHERE ${t.files.owner} = ${t.users.id}), 0)`,
    })
    .from(t.users)
    .where(eq(t.users.id, id))
    .get();
  return row ?? null;
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
