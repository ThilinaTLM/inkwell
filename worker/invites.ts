// Invite tokens.
//
// An invite is a single-use, optionally-expiring token. Anyone holding the
// token can register an account with any email. Admins generate invites
// from the admin dashboard; the resulting URL must be shared out-of-band
// (no email delivery is built in).
//
// Flow:
//   1. POST /api/admin/invites { expiresInHours? }       -> { token, url, expiresAt }
//   2. GET  /api/invites/:token                          -> { ok, expiresAt }
//   3. POST /api/invites/:token/accept { email, password, firstName, lastName }
//                                                         -> sets session cookie
//   4. DELETE /api/admin/invites/:token                  -> revoke (admin)

import { and, desc, eq, gt, isNull, or } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import { createSessionCookie } from "./auth";
import { getDb, t } from "./db/client";
import type { Env, InviteAdminRow, InviteRow, UserRow } from "./types";
import { rowToInvitePublic } from "./types";
import { createUser, emailIsTaken, isValidEmail, isValidPassword, trimName } from "./users";
import { errorResponse, jsonResponse, newToken, now } from "./util";

// ─── Admin: list ──────────────────────────────────────────────────────
export async function listInvitesAdmin(env: Env): Promise<Response> {
  const db = getDb(env);
  const cu = alias(t.users, "cu");
  const uu = alias(t.users, "uu");
  const rows = await db
    .select({
      token: t.invites.token,
      created_by: t.invites.created_by,
      created_at: t.invites.created_at,
      expires_at: t.invites.expires_at,
      used_by_user_id: t.invites.used_by_user_id,
      used_at: t.invites.used_at,
      revoked_at: t.invites.revoked_at,
      created_by_email: cu.email,
      used_by_email: uu.email,
    })
    .from(t.invites)
    .leftJoin(cu, eq(cu.id, t.invites.created_by))
    .leftJoin(uu, eq(uu.id, t.invites.used_by_user_id))
    .orderBy(desc(t.invites.created_at))
    .limit(500)
    .all();
  const ts = now();
  return jsonResponse({
    invites: rows.map((r) => rowToInvitePublic(r as InviteAdminRow, ts)),
  });
}

// ─── Admin: create ────────────────────────────────────────────────────
export async function createInviteAdmin(
  req: Request,
  env: Env,
  creatorId: string,
  origin: string | null,
): Promise<Response> {
  let body: { expiresInHours?: number | null };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    body = {};
  }

  let expiresAt: number | null = null;
  if (body.expiresInHours !== null && body.expiresInHours !== undefined) {
    const hours = Number(body.expiresInHours);
    if (!Number.isFinite(hours) || hours <= 0 || hours > 24 * 365 * 10) {
      return errorResponse(400, "invalid expiresInHours");
    }
    expiresAt = Date.now() + Math.floor(hours * 60 * 60 * 1000);
  }

  const token = newToken();
  const ts = now();
  const db = getDb(env);
  await db
    .insert(t.invites)
    .values({
      token,
      created_by: creatorId,
      created_at: ts,
      expires_at: expiresAt,
    })
    .run();

  const url = origin ? `${origin}/invite/${token}` : `/invite/${token}`;
  return jsonResponse({ token, url, expiresAt, createdAt: ts });
}

// ─── Admin: revoke ────────────────────────────────────────────────────
export async function revokeInviteAdmin(env: Env, token: string): Promise<Response> {
  const db = getDb(env);
  const row = await db
    .select({ token: t.invites.token, used_at: t.invites.used_at })
    .from(t.invites)
    .where(eq(t.invites.token, token))
    .get();
  if (!row) return errorResponse(404, "invite not found");
  if (row.used_at) return errorResponse(409, "invite already used");
  await db.update(t.invites).set({ revoked_at: now() }).where(eq(t.invites.token, token)).run();
  return jsonResponse({ ok: true });
}

// ─── Public: peek ─────────────────────────────────────────────────────
// Returns 200 with `{ ok: true, expiresAt }` if usable, or:
//   404 — token not found
//   410 — used / revoked / expired
export async function peekInvite(env: Env, token: string): Promise<Response> {
  const row = await loadInvite(env, token);
  if (!row) return errorResponse(404, "invite not found");
  const reason = unusableReason(row);
  if (reason) return errorResponse(410, reason);
  return jsonResponse({ ok: true, expiresAt: row.expires_at });
}

// ─── Public: accept ───────────────────────────────────────────────────
export async function acceptInvite(req: Request, env: Env, token: string): Promise<Response> {
  const row = await loadInvite(env, token);
  if (!row) return errorResponse(404, "invite not found");
  const reason = unusableReason(row);
  if (reason) return errorResponse(410, reason);

  let body: {
    email?: string;
    password?: string;
    firstName?: string;
    lastName?: string;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return errorResponse(400, "invalid JSON");
  }

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!isValidEmail(email)) return errorResponse(400, "invalid email");
  if (!isValidPassword(body.password))
    return errorResponse(400, "password must be 8\u2013200 characters");
  const password = body.password;
  if (await emailIsTaken(env, email)) return errorResponse(409, "email already in use");

  let user: UserRow;
  try {
    user = await createUser(env, {
      email,
      password,
      firstName: trimName(body.firstName),
      lastName: trimName(body.lastName),
      isAdmin: false,
    });
  } catch (_err) {
    // Most likely a UNIQUE-constraint race — someone else just took the
    // email between our check and the insert. Map to 409.
    return errorResponse(409, "email already in use");
  }

  // Race-safely consume the invite. If another acceptance won the race we
  // delete the user we just created and return 409 so the client can retry
  // with a fresh attempt (or see that the invite was used).
  const db = getDb(env);
  const nowMs = Date.now();
  const consumed = await db
    .update(t.invites)
    .set({ used_at: nowMs, used_by_user_id: user.id })
    .where(
      and(
        eq(t.invites.token, token),
        isNull(t.invites.used_at),
        isNull(t.invites.revoked_at),
        or(isNull(t.invites.expires_at), gt(t.invites.expires_at, nowMs)),
      ),
    )
    .run();

  if (!consumed.meta?.changes) {
    // Roll back the user. Best-effort.
    await db.delete(t.users).where(eq(t.users.id, user.id)).run();
    return errorResponse(409, "invite no longer usable");
  }

  // Issue a session cookie immediately so the new user lands logged in.
  await db.update(t.users).set({ last_login_at: now() }).where(eq(t.users.id, user.id)).run();
  const cookie = await createSessionCookie(env, user.id);
  return new Response(
    JSON.stringify({
      id: user.id,
      email: user.email,
      firstName: user.first_name,
      lastName: user.last_name,
      isAdmin: user.is_admin,
    }),
    {
      status: 200,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "set-cookie": cookie,
      },
    },
  );
}

// ─── Internals ────────────────────────────────────────────────────────
async function loadInvite(env: Env, token: string): Promise<InviteRow | null> {
  const db = getDb(env);
  const row = await db.select().from(t.invites).where(eq(t.invites.token, token)).get();
  return row ?? null;
}

function unusableReason(r: InviteRow): string | null {
  if (r.revoked_at) return "invite revoked";
  if (r.used_at) return "invite already used";
  if (r.expires_at !== null && r.expires_at <= Date.now()) return "invite expired";
  return null;
}
