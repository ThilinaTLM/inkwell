// Auth and session management for Inkwell.
//
// Session model: an HMAC-signed cookie of the form
//   <userId>.<expiresAtMs>.<base64url(hmacSha256(userId.expiresAt))>
// signed with SESSION_SECRET. Every authenticated request verifies the HMAC,
// re-reads the user row from D1, and rejects disabled / missing users.
// Refreshing the user row on every request lets admin actions (disable,
// demote, delete) take effect immediately rather than waiting for cookie
// expiry.
//
// First-run super-admin bootstrap: on a login attempt where the submitted
// email matches `SUPER_ADMIN_EMAIL` (case-insensitive) and no users row
// exists for that email, we create the super-admin with the supplied
// password (verified against `SUPER_ADMIN_PASSWORD`). After bootstrap, the
// admin manages their password via the UI; the env var is only consulted
// again if no row exists for that email.

import type { Env, UserRow } from "./types";
import { hashPassword, verifyPassword } from "./passwords";
import { base64url, newId, now, timingSafeEqual } from "./util";

const COOKIE_NAME = "inkwell_session";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export interface Session {
  userId: string;
  email: string;
  isAdmin: boolean;
  expiresAt: number;
}

// ─── Cookie helpers ───────────────────────────────────────────────────
async function hmac(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return base64url(new Uint8Array(sig));
}

export async function createSessionCookie(env: Env, userId: string): Promise<string> {
  const expiresAt = Date.now() + SESSION_TTL_MS;
  const payload = `${userId}.${expiresAt}`;
  const sig = await hmac(env.SESSION_SECRET, payload);
  const value = `${payload}.${sig}`;
  return `${COOKIE_NAME}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(
    SESSION_TTL_MS / 1000
  )}; Secure`;
}

export function clearSessionCookie(): string {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0; Secure`;
}

// Parses, verifies HMAC + expiry, then loads the user row. Returns null if
// the cookie is missing, tampered, expired, or refers to a missing/disabled
// user.
export async function validateSession(req: Request, env: Env): Promise<Session | null> {
  const cookie = req.headers.get("cookie") || "";
  const match = cookie.match(new RegExp(`(?:^|;\\s*)${COOKIE_NAME}=([^;]+)`));
  if (!match) return null;

  const value = match[1];
  const lastDot = value.lastIndexOf(".");
  if (lastDot < 0) return null;

  const payload = value.slice(0, lastDot);
  const sig = value.slice(lastDot + 1);
  const expected = await hmac(env.SESSION_SECRET, payload);
  if (!timingSafeEqual(sig, expected)) return null;

  const [userId, expiresAtStr] = payload.split(".");
  const expiresAt = Number(expiresAtStr);
  if (!Number.isFinite(expiresAt) || expiresAt < Date.now()) return null;
  if (!userId) return null;

  const user = await getUserById(env, userId);
  if (!user || user.disabled) return null;

  return {
    userId: user.id,
    email: user.email,
    isAdmin: !!user.is_admin,
    expiresAt,
  };
}

// ─── User-row helpers ─────────────────────────────────────────────────
// These live here (rather than `users.ts`) because the auth path needs them
// before any of the admin handlers are imported. `users.ts` re-exports the
// ones it needs for the admin surface.

export async function getUserById(env: Env, id: string): Promise<UserRow | null> {
  return await env.DB.prepare(
    `SELECT id, email, password_hash, first_name, last_name, is_admin, disabled,
            created_at, updated_at, last_login_at
     FROM users WHERE id = ?`
  )
    .bind(id)
    .first<UserRow>();
}

export async function getUserByEmail(env: Env, email: string): Promise<UserRow | null> {
  return await env.DB.prepare(
    `SELECT id, email, password_hash, first_name, last_name, is_admin, disabled,
            created_at, updated_at, last_login_at
     FROM users WHERE email = ?`
  )
    .bind(email.toLowerCase())
    .first<UserRow>();
}

// ─── Login + bootstrap ────────────────────────────────────────────────

/**
 * Result of a login attempt. `user` is non-null on success. `reason` is set
 * for the caller to map to an HTTP status / error message.
 */
export type LoginResult =
  | { ok: true; user: UserRow }
  | { ok: false; reason: "invalid" | "disabled" | "misconfigured" };

/**
 * Attempts to log in a user by email + password. Runs the super-admin
 * bootstrap path automatically if the email matches `SUPER_ADMIN_EMAIL` and
 * the user row doesn't yet exist.
 */
export async function loginWithPassword(
  env: Env,
  rawEmail: string,
  password: string
): Promise<LoginResult> {
  const email = rawEmail.trim().toLowerCase();
  if (!email || !password) return { ok: false, reason: "invalid" };

  // Bootstrap super-admin on demand.
  if (
    env.SUPER_ADMIN_EMAIL &&
    email === env.SUPER_ADMIN_EMAIL.trim().toLowerCase()
  ) {
    const existing = await getUserByEmail(env, email);
    if (!existing) {
      if (!env.SUPER_ADMIN_PASSWORD) {
        return { ok: false, reason: "misconfigured" };
      }
      // The supplied password must match SUPER_ADMIN_PASSWORD to claim the
      // super-admin slot. We don't fall back to "create with whatever they
      // typed" because that would let any caller mint the first admin.
      if (password !== env.SUPER_ADMIN_PASSWORD) {
        return { ok: false, reason: "invalid" };
      }
      const created = await createSuperAdmin(env, email, password);
      return { ok: true, user: created };
    }
  }

  const user = await getUserByEmail(env, email);
  if (!user) return { ok: false, reason: "invalid" };
  if (user.disabled) return { ok: false, reason: "disabled" };

  const ok = await verifyPassword(password, user.password_hash);
  if (!ok) return { ok: false, reason: "invalid" };

  // Update last_login_at; ignore failures (non-critical).
  const t = now();
  await env.DB.prepare(`UPDATE users SET last_login_at = ? WHERE id = ?`)
    .bind(t, user.id)
    .run();
  user.last_login_at = t;
  return { ok: true, user };
}

async function createSuperAdmin(env: Env, email: string, password: string): Promise<UserRow> {
  const id = newId();
  const t = now();
  const hash = await hashPassword(password);
  await env.DB.prepare(
    `INSERT INTO users
       (id, email, password_hash, first_name, last_name, is_admin, disabled,
        created_at, updated_at, last_login_at)
     VALUES (?, ?, ?, '', '', 1, 0, ?, ?, ?)`
  )
    .bind(id, email, hash, t, t, t)
    .run();
  return {
    id,
    email,
    password_hash: hash,
    first_name: "",
    last_name: "",
    is_admin: 1,
    disabled: 0,
    created_at: t,
    updated_at: t,
    last_login_at: t,
  };
}

// ─── Self-service password change ─────────────────────────────────────

export async function changeOwnPassword(
  env: Env,
  userId: string,
  currentPassword: string,
  newPassword: string
): Promise<{ ok: true } | { ok: false; reason: "invalid_current" | "weak" | "missing" }> {
  if (!newPassword || newPassword.length < 8) return { ok: false, reason: "weak" };
  const user = await getUserById(env, userId);
  if (!user) return { ok: false, reason: "missing" };
  const ok = await verifyPassword(currentPassword, user.password_hash);
  if (!ok) return { ok: false, reason: "invalid_current" };
  const newHash = await hashPassword(newPassword);
  await env.DB.prepare(`UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?`)
    .bind(newHash, now(), userId)
    .run();
  return { ok: true };
}
