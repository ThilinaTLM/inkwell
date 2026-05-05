// Authenticated /api/me + /api/me/password.

import { Hono } from "hono";
import { changeOwnPassword } from "../auth";
import * as usersRepo from "../db/repos/users";
import { errorResponse, jsonResponse } from "../lib/responses";
import { requireSession } from "../middleware/auth";
import { parseJson } from "../middleware/body";
import type { AppEnv } from "../middleware/types";

const r = new Hono<AppEnv>();

r.use("*", requireSession);

r.get("/", async (c) => {
  const session = c.get("session");
  // Re-read the user row so the SPA always sees up-to-date first/last
  // names and admin flags after a profile change. validateSession
  // already touched this row once for authz; the second read is a
  // single primary-key lookup.
  const row = await usersRepo.findById(c.env, session.userId);
  if (!row) return errorResponse(401, "not authenticated");
  return jsonResponse({
    id: row.id,
    email: row.email,
    firstName: row.first_name,
    lastName: row.last_name,
    isAdmin: row.is_admin,
    expiresAt: session.expiresAt,
  });
});

interface ChangePasswordBody {
  currentPassword?: string;
  newPassword?: string;
}

r.post("/password", async (c) => {
  const session = c.get("session");
  const body = await parseJson<ChangePasswordBody>(c);
  if (body instanceof Response) return body;
  const result = await changeOwnPassword(
    c.env,
    session.userId,
    body.currentPassword || "",
    body.newPassword || "",
  );
  if (result.ok) return jsonResponse({ ok: true });
  if (result.reason === "weak") {
    return errorResponse(400, "new password must be at least 8 characters");
  }
  if (result.reason === "invalid_current") {
    return errorResponse(401, "current password incorrect");
  }
  return errorResponse(500, "could not change password");
});

export default r;
