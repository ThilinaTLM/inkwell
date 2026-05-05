// User management — admin endpoints + helpers used by the invite flow.
//
// Admin endpoints live under /api/admin/users/*. All require an authenticated
// admin session (gated in worker/index.ts via `requireAdmin`).

import { asc, eq, sql } from "drizzle-orm";
import { getUserByEmail } from "./auth";
import { getDb, t } from "./db/client";
import { fileKey, thumbKey } from "./files";
import { hashPassword } from "./passwords";
import type { AdminUserRow, Env, UserRow } from "./types";
import { rowToAdminUserPublic } from "./types";
import { errorResponse, jsonResponse, newId, now } from "./util";

// ─── Validation ───────────────────────────────────────────────────────
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export function isValidEmail(s: unknown): s is string {
  return typeof s === "string" && s.length <= 254 && EMAIL_RE.test(s);
}
export function isValidPassword(s: unknown): s is string {
  return typeof s === "string" && s.length >= 8 && s.length <= 200;
}
export function trimName(s: unknown, max = 80): string {
  if (typeof s !== "string") return "";
  return s.trim().slice(0, max);
}

// ─── Create user ──────────────────────────────────────────────────────
export interface CreateUserInput {
  email: string;
  password: string;
  firstName?: string;
  lastName?: string;
  isAdmin?: boolean;
}

export async function createUser(env: Env, input: CreateUserInput): Promise<UserRow> {
  const email = input.email.trim().toLowerCase();
  const id = newId();
  const ts = now();
  const hash = await hashPassword(input.password);
  const firstName = trimName(input.firstName);
  const lastName = trimName(input.lastName);
  const isAdmin = !!input.isAdmin;
  const db = getDb(env);
  await db
    .insert(t.users)
    .values({
      id,
      email,
      password_hash: hash,
      first_name: firstName,
      last_name: lastName,
      is_admin: isAdmin,
      disabled: false,
      created_at: ts,
      updated_at: ts,
      last_login_at: null,
    })
    .run();
  return {
    id,
    email,
    password_hash: hash,
    first_name: firstName,
    last_name: lastName,
    is_admin: isAdmin,
    disabled: false,
    created_at: ts,
    updated_at: ts,
    last_login_at: null,
  };
}

// ─── Cascade delete ───────────────────────────────────────────────────
// Removes the user and everything they own: files (D1 rows + R2 blobs +
// thumbnails), folders, tags + taggings, shares (across both target types),
// and invites they created. Best-effort on R2 — a partial failure leaves
// orphan objects but D1 stays consistent.
export async function deleteUserCascade(env: Env, userId: string): Promise<void> {
  const db = getDb(env);
  const fileIdRows = await db
    .select({ id: t.files.id })
    .from(t.files)
    .where(eq(t.files.owner, userId))
    .all();
  const fileIds = fileIdRows.map((r) => r.id);

  // Wipe owner-scoped rows from the organization tables. Order matters
  // only for FK-honoring engines; with `PRAGMA foreign_keys = ON` D1 will
  // cascade most of these, but we run them explicitly so behavior is the
  // same on a connection without the pragma.
  await db.batch([
    db.delete(t.shares).where(eq(t.shares.owner, userId)),
    db.delete(t.taggings).where(eq(t.taggings.owner, userId)),
    db.delete(t.tags).where(eq(t.tags.owner, userId)),
    db.delete(t.files).where(eq(t.files.owner, userId)),
  ]);

  if (fileIds.length > 0) {
    // Wipe R2 objects in parallel.
    const deletes: Promise<unknown>[] = [];
    for (const id of fileIds) {
      deletes.push(env.R2.delete(fileKey(id)));
      deletes.push(env.R2.delete(thumbKey(id)));
    }
    await Promise.allSettled(deletes);
  }

  // Folders go after files (folders may be referenced by files via
  // ON DELETE SET NULL; with all the user's files gone it's a clean drop).
  // Then invites created by the user, then the user row itself. Invites
  // would cascade via FK on a connection with PRAGMA foreign_keys = ON,
  // but we delete them explicitly so behavior is independent of the pragma.
  await db.batch([
    db.delete(t.folders).where(eq(t.folders.owner, userId)),
    db.delete(t.invites).where(eq(t.invites.created_by, userId)),
    db.delete(t.users).where(eq(t.users.id, userId)),
  ]);
}

// ─── Admin: list ──────────────────────────────────────────────────────
export async function listUsersAdmin(env: Env): Promise<Response> {
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
  return jsonResponse({ users: rows.map((r) => rowToAdminUserPublic(r as AdminUserRow)) });
}

// ─── Admin: patch (role / disabled / names) ───────────────────────────
export async function patchUserAdmin(
  req: Request,
  env: Env,
  selfId: string,
  targetId: string,
): Promise<Response> {
  if (targetId === selfId) {
    return errorResponse(400, "cannot modify your own admin/disabled status");
  }
  let body: {
    isAdmin?: boolean;
    disabled?: boolean;
    firstName?: string;
    lastName?: string;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return errorResponse(400, "invalid JSON");
  }

  const db = getDb(env);
  const target = await db.select().from(t.users).where(eq(t.users.id, targetId)).get();
  if (!target) return errorResponse(404, "user not found");

  // Drizzle's `.set()` accepts a partial object; build it up from `body`
  // so untouched fields are not rewritten.
  const patch: Partial<UserRow> = {};
  if (typeof body.isAdmin === "boolean") patch.is_admin = body.isAdmin;
  if (typeof body.disabled === "boolean") patch.disabled = body.disabled;
  if (typeof body.firstName === "string") patch.first_name = trimName(body.firstName);
  if (typeof body.lastName === "string") patch.last_name = trimName(body.lastName);
  if (Object.keys(patch).length === 0) return errorResponse(400, "no fields to update");
  patch.updated_at = now();

  await db.update(t.users).set(patch).where(eq(t.users.id, targetId)).run();

  // Re-read with file count for the response, mirroring listUsersAdmin.
  const updated = await db
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
    .where(eq(t.users.id, targetId))
    .get();
  if (!updated) return errorResponse(404, "user not found");
  return jsonResponse(rowToAdminUserPublic(updated as AdminUserRow));
}

// ─── Admin: delete ────────────────────────────────────────────────────
export async function deleteUserAdmin(
  env: Env,
  selfId: string,
  targetId: string,
): Promise<Response> {
  if (targetId === selfId) {
    return errorResponse(400, "cannot delete yourself");
  }
  const db = getDb(env);
  const target = await db
    .select({ id: t.users.id })
    .from(t.users)
    .where(eq(t.users.id, targetId))
    .get();
  if (!target) return errorResponse(404, "user not found");
  await deleteUserCascade(env, targetId);
  return jsonResponse({ ok: true });
}

// ─── Email-uniqueness helper for the invite flow ──────────────────────
export async function emailIsTaken(env: Env, email: string): Promise<boolean> {
  const row = await getUserByEmail(env, email);
  return !!row;
}
