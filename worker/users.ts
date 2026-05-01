// User management — admin endpoints + helpers used by the invite flow.
//
// Admin endpoints live under /api/admin/users/*. All require an authenticated
// admin session (gated in worker/index.ts via `requireAdmin`).

import type { AdminUserRow, Env, SceneRow, UserRow } from "./types";
import { rowToAdminUserPublic } from "./types";
import { errorResponse, jsonResponse, newId, now } from "./util";
import { getUserByEmail } from "./auth";
import { hashPassword } from "./passwords";
import { sceneKey, thumbKey } from "./scenes";

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
  const t = now();
  const hash = await hashPassword(input.password);
  const firstName = trimName(input.firstName);
  const lastName = trimName(input.lastName);
  const isAdmin = input.isAdmin ? 1 : 0;
  await env.DB.prepare(
    `INSERT INTO users
       (id, email, password_hash, first_name, last_name, is_admin, disabled,
        created_at, updated_at, last_login_at)
     VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, NULL)`
  )
    .bind(id, email, hash, firstName, lastName, isAdmin, t, t)
    .run();
  return {
    id,
    email,
    password_hash: hash,
    first_name: firstName,
    last_name: lastName,
    is_admin: isAdmin,
    disabled: 0,
    created_at: t,
    updated_at: t,
    last_login_at: null,
  };
}

// ─── Cascade delete ───────────────────────────────────────────────────
// Removes the user and everything they own: scenes (D1 rows + R2 blobs +
// thumbnails), folders, tags + taggings, shares (across both target types),
// and invites they created. Best-effort on R2 — a partial failure leaves
// orphan objects but D1 stays consistent.
export async function deleteUserCascade(env: Env, userId: string): Promise<void> {
  const { results } = await env.DB.prepare(
    `SELECT id FROM scenes WHERE owner = ?`
  )
    .bind(userId)
    .all<Pick<SceneRow, "id">>();

  const sceneIds = (results || []).map((r) => r.id);

  // Wipe owner-scoped rows from the organization tables. Order matters
  // only for FK-honoring engines; with `PRAGMA foreign_keys = ON` D1 will
  // cascade most of these, but we run them explicitly so behavior is the
  // same on a connection without the pragma.
  await env.DB.prepare(`DELETE FROM shares   WHERE owner = ?`).bind(userId).run();
  await env.DB.prepare(`DELETE FROM taggings WHERE owner = ?`).bind(userId).run();
  await env.DB.prepare(`DELETE FROM tags     WHERE owner = ?`).bind(userId).run();

  if (sceneIds.length > 0) {
    // Wipe scene rows.
    await env.DB.prepare(`DELETE FROM scenes WHERE owner = ?`).bind(userId).run();

    // Wipe R2 objects in parallel.
    const deletes: Promise<unknown>[] = [];
    for (const id of sceneIds) {
      deletes.push(env.R2.delete(sceneKey(id)));
      deletes.push(env.R2.delete(thumbKey(id)));
    }
    await Promise.allSettled(deletes);
  }

  // Folders go after scenes (folders may be referenced by scenes via
  // ON DELETE SET NULL; with all the user's scenes gone it's a clean drop).
  await env.DB.prepare(`DELETE FROM folders WHERE owner = ?`).bind(userId).run();

  // Finally drop the user. Invites created by the user cascade automatically
  // (the `created_by` FK uses ON DELETE CASCADE — declared in schema and
  // enforced by us via the explicit DELETE here in case D1 hasn't honored
  // the FK).
  await env.DB.prepare(`DELETE FROM invites WHERE created_by = ?`).bind(userId).run();
  await env.DB.prepare(`DELETE FROM users WHERE id = ?`).bind(userId).run();
}

// ─── Admin: list ──────────────────────────────────────────────────────
export async function listUsersAdmin(env: Env): Promise<Response> {
  const { results } = await env.DB.prepare(
    `SELECT u.id, u.email, u.password_hash, u.first_name, u.last_name,
            u.is_admin, u.disabled, u.created_at, u.updated_at, u.last_login_at,
            COALESCE((SELECT COUNT(*) FROM scenes s WHERE s.owner = u.id), 0) AS scene_count
     FROM users u
     ORDER BY u.created_at ASC`
  ).all<AdminUserRow>();
  return jsonResponse({ users: (results || []).map(rowToAdminUserPublic) });
}

// ─── Admin: patch (role / disabled / names) ───────────────────────────
export async function patchUserAdmin(
  req: Request,
  env: Env,
  selfId: string,
  targetId: string
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

  const target = await env.DB.prepare(
    `SELECT id, email, password_hash, first_name, last_name, is_admin, disabled,
            created_at, updated_at, last_login_at
     FROM users WHERE id = ?`
  )
    .bind(targetId)
    .first<UserRow>();
  if (!target) return errorResponse(404, "user not found");

  const sets: string[] = [];
  const vals: unknown[] = [];

  if (typeof body.isAdmin === "boolean") {
    sets.push("is_admin = ?");
    vals.push(body.isAdmin ? 1 : 0);
  }
  if (typeof body.disabled === "boolean") {
    sets.push("disabled = ?");
    vals.push(body.disabled ? 1 : 0);
  }
  if (typeof body.firstName === "string") {
    sets.push("first_name = ?");
    vals.push(trimName(body.firstName));
  }
  if (typeof body.lastName === "string") {
    sets.push("last_name = ?");
    vals.push(trimName(body.lastName));
  }
  if (sets.length === 0) return errorResponse(400, "no fields to update");

  sets.push("updated_at = ?");
  vals.push(now());

  vals.push(targetId);
  await env.DB.prepare(`UPDATE users SET ${sets.join(", ")} WHERE id = ?`)
    .bind(...vals)
    .run();

  // Re-read with scene count for the response, mirroring listUsersAdmin.
  const updated = await env.DB.prepare(
    `SELECT u.id, u.email, u.password_hash, u.first_name, u.last_name,
            u.is_admin, u.disabled, u.created_at, u.updated_at, u.last_login_at,
            COALESCE((SELECT COUNT(*) FROM scenes s WHERE s.owner = u.id), 0) AS scene_count
     FROM users u WHERE u.id = ?`
  )
    .bind(targetId)
    .first<AdminUserRow>();
  if (!updated) return errorResponse(404, "user not found");
  return jsonResponse(rowToAdminUserPublic(updated));
}

// ─── Admin: delete ────────────────────────────────────────────────────
export async function deleteUserAdmin(
  env: Env,
  selfId: string,
  targetId: string
): Promise<Response> {
  if (targetId === selfId) {
    return errorResponse(400, "cannot delete yourself");
  }
  const target = await env.DB.prepare(`SELECT id FROM users WHERE id = ?`)
    .bind(targetId)
    .first<{ id: string }>();
  if (!target) return errorResponse(404, "user not found");
  await deleteUserCascade(env, targetId);
  return jsonResponse({ ok: true });
}

// ─── Email-uniqueness helper for the invite flow ──────────────────────
export async function emailIsTaken(env: Env, email: string): Promise<boolean> {
  const row = await getUserByEmail(env, email);
  return !!row;
}
