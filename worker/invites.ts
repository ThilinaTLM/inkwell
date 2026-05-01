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

import type { Env, InviteAdminRow, InviteRow, UserRow } from "./types";
import { rowToInvitePublic } from "./types";
import { errorResponse, jsonResponse, newToken, now } from "./util";
import { createSessionCookie } from "./auth";
import {
  createUser,
  emailIsTaken,
  isValidEmail,
  isValidPassword,
  trimName,
} from "./users";

// ─── Admin: list ──────────────────────────────────────────────────────
export async function listInvitesAdmin(env: Env): Promise<Response> {
  const { results } = await env.DB.prepare(
    `SELECT i.token, i.created_by, i.created_at, i.expires_at,
            i.used_by_user_id, i.used_at, i.revoked_at,
            cu.email AS created_by_email,
            uu.email AS used_by_email
     FROM invites i
     LEFT JOIN users cu ON cu.id = i.created_by
     LEFT JOIN users uu ON uu.id = i.used_by_user_id
     ORDER BY i.created_at DESC
     LIMIT 500`
  ).all<InviteAdminRow>();
  const t = now();
  return jsonResponse({
    invites: (results || []).map((r) => rowToInvitePublic(r, t)),
  });
}

// ─── Admin: create ────────────────────────────────────────────────────
export async function createInviteAdmin(
  req: Request,
  env: Env,
  creatorId: string,
  origin: string | null
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
  const t = now();
  await env.DB.prepare(
    `INSERT INTO invites
       (token, created_by, created_at, expires_at, used_by_user_id, used_at, revoked_at)
     VALUES (?, ?, ?, ?, NULL, NULL, NULL)`
  )
    .bind(token, creatorId, t, expiresAt)
    .run();

  const url = origin ? `${origin}/invite/${token}` : `/invite/${token}`;
  return jsonResponse({ token, url, expiresAt, createdAt: t });
}

// ─── Admin: revoke ────────────────────────────────────────────────────
export async function revokeInviteAdmin(env: Env, token: string): Promise<Response> {
  const row = await env.DB.prepare(`SELECT token, used_at FROM invites WHERE token = ?`)
    .bind(token)
    .first<{ token: string; used_at: number | null }>();
  if (!row) return errorResponse(404, "invite not found");
  if (row.used_at) return errorResponse(409, "invite already used");
  await env.DB.prepare(`UPDATE invites SET revoked_at = ? WHERE token = ?`)
    .bind(now(), token)
    .run();
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
  if (await emailIsTaken(env, email)) return errorResponse(409, "email already in use");

  let user: UserRow;
  try {
    user = await createUser(env, {
      email,
      password: body.password!,
      firstName: trimName(body.firstName),
      lastName: trimName(body.lastName),
      isAdmin: false,
    });
  } catch (err) {
    // Most likely a UNIQUE-constraint race — someone else just took the
    // email between our check and the insert. Map to 409.
    return errorResponse(409, "email already in use");
  }

  // Race-safely consume the invite. If another acceptance won the race we
  // delete the user we just created and return 409 so the client can retry
  // with a fresh attempt (or see that the invite was used).
  const consumed = await env.DB.prepare(
    `UPDATE invites
       SET used_at = ?, used_by_user_id = ?
       WHERE token = ?
         AND used_at IS NULL
         AND revoked_at IS NULL
         AND (expires_at IS NULL OR expires_at > ?)`
  )
    .bind(now(), user.id, token, Date.now())
    .run();

  if (!consumed.meta?.changes) {
    // Roll back the user. Best-effort.
    await env.DB.prepare(`DELETE FROM users WHERE id = ?`).bind(user.id).run();
    return errorResponse(409, "invite no longer usable");
  }

  // Issue a session cookie immediately so the new user lands logged in.
  await env.DB.prepare(`UPDATE users SET last_login_at = ? WHERE id = ?`)
    .bind(now(), user.id)
    .run();
  const cookie = await createSessionCookie(env, user.id);
  return new Response(
    JSON.stringify({
      id: user.id,
      email: user.email,
      firstName: user.first_name,
      lastName: user.last_name,
      isAdmin: !!user.is_admin,
    }),
    {
      status: 200,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "set-cookie": cookie,
      },
    }
  );
}

// ─── Internals ────────────────────────────────────────────────────────
async function loadInvite(env: Env, token: string): Promise<InviteRow | null> {
  return await env.DB.prepare(
    `SELECT token, created_by, created_at, expires_at,
            used_by_user_id, used_at, revoked_at
     FROM invites WHERE token = ?`
  )
    .bind(token)
    .first<InviteRow>();
}

function unusableReason(r: InviteRow): string | null {
  if (r.revoked_at) return "invite revoked";
  if (r.used_at) return "invite already used";
  if (r.expires_at !== null && r.expires_at <= Date.now()) return "invite expired";
  return null;
}
