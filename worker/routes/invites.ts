// Public invite routes: peek + accept.
//
// Mounted at `/api/invites`. The admin invite endpoints live under
// `/api/admin/invites` (worker/routes/admin.ts).

import { Hono } from "hono";
import { createSessionCookie } from "../auth";
import * as invitesRepo from "../db/repos/invites";
import * as usersRepo from "../db/repos/users";
import { newId } from "../lib/crypto";
import { errorResponse, jsonResponse } from "../lib/responses";
import { now } from "../lib/util";
import { parseJson } from "../middleware/body";
import type { AppEnv } from "../middleware/types";
import { hashPassword } from "../passwords";
import type { InviteRow, UserRow } from "../types";

const r = new Hono<AppEnv>();

// ─── Internals ───────────────────────────────────────────────────────
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function isValidEmail(s: unknown): s is string {
  return typeof s === "string" && s.length <= 254 && EMAIL_RE.test(s);
}
function isValidPassword(s: unknown): s is string {
  return typeof s === "string" && s.length >= 8 && s.length <= 200;
}
function trimName(s: unknown, max = 80): string {
  if (typeof s !== "string") return "";
  return s.trim().slice(0, max);
}

function unusableReason(r: InviteRow): string | null {
  if (r.revoked_at) return "invite revoked";
  if (r.used_at) return "invite already used";
  if (r.expires_at !== null && r.expires_at <= Date.now()) return "invite expired";
  return null;
}

// Exported for the admin route, which uses the same email-uniqueness
// check when creating users.
export async function emailIsTaken(env: AppEnv["Bindings"], email: string): Promise<boolean> {
  const row = await usersRepo.findByEmail(env, email);
  return !!row;
}

// Exported for the admin route + invite acceptance.
export async function createUser(
  env: AppEnv["Bindings"],
  input: {
    email: string;
    password: string;
    firstName?: string;
    lastName?: string;
    isAdmin?: boolean;
  },
): Promise<UserRow> {
  const email = input.email.trim().toLowerCase();
  const id = newId();
  const ts = now();
  const hash = await hashPassword(input.password);
  const row: UserRow = {
    id,
    email,
    password_hash: hash,
    first_name: trimName(input.firstName),
    last_name: trimName(input.lastName),
    is_admin: !!input.isAdmin,
    disabled: false,
    created_at: ts,
    updated_at: ts,
    last_login_at: null,
  };
  await usersRepo.insert(env, row);
  return row;
}

// ─── GET /api/invites/:token (peek) ──────────────────────────────────
r.get("/:token", async (c) => {
  const token = c.req.param("token");
  const row = await invitesRepo.findByToken(c.env, token);
  if (!row) return errorResponse(404, "invite not found");
  const reason = unusableReason(row);
  if (reason) return errorResponse(410, reason);
  return jsonResponse({ ok: true, expiresAt: row.expires_at });
});

// ─── POST /api/invites/:token/accept ─────────────────────────────────
interface AcceptBody {
  email?: string;
  password?: string;
  firstName?: string;
  lastName?: string;
}

r.post("/:token/accept", async (c) => {
  const token = c.req.param("token");
  const row = await invitesRepo.findByToken(c.env, token);
  if (!row) return errorResponse(404, "invite not found");
  const reason = unusableReason(row);
  if (reason) return errorResponse(410, reason);

  const body = await parseJson<AcceptBody>(c);
  if (body instanceof Response) return body;

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!isValidEmail(email)) return errorResponse(400, "invalid email");
  if (!isValidPassword(body.password)) {
    return errorResponse(400, "password must be 8\u2013200 characters");
  }
  const password = body.password;
  if (await emailIsTaken(c.env, email)) return errorResponse(409, "email already in use");

  let user: UserRow;
  try {
    user = await createUser(c.env, {
      email,
      password,
      firstName: trimName(body.firstName),
      lastName: trimName(body.lastName),
      isAdmin: false,
    });
  } catch {
    // Most likely a UNIQUE-constraint race — someone else just took the
    // email between our check and the insert. Map to 409.
    return errorResponse(409, "email already in use");
  }

  // Race-safely consume the invite. If another acceptance won the race
  // we delete the user we just created and return 409 so the client can
  // retry with a fresh attempt.
  const consumed = await invitesRepo.tryConsume(c.env, token, user.id);
  if (!consumed) {
    // Roll back the user row. Best-effort.
    await usersRepo.deleteById(c.env, user.id);
    return errorResponse(409, "invite no longer usable");
  }

  user.last_login_at = await usersRepo.bumpLastLogin(c.env, user.id);
  const cookie = await createSessionCookie(c.env, user.id);
  return jsonResponse(
    {
      id: user.id,
      email: user.email,
      firstName: user.first_name,
      lastName: user.last_name,
      isAdmin: user.is_admin,
    },
    {
      status: 200,
      headers: { "set-cookie": cookie },
    },
  );
});

export default r;
