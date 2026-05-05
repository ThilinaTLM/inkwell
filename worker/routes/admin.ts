// Admin-only routes mounted at `/api/admin`.
//
// Two resources: users and invites. Routes here delegate to the repo
// layer for data access and to delete-cascade for user deletion.

import { Hono } from "hono";
import * as invitesRepo from "../db/repos/invites";
import * as usersRepo from "../db/repos/users";
import { newToken } from "../lib/crypto";
import { errorResponse, jsonResponse } from "../lib/responses";
import { now } from "../lib/util";
import { requireAdmin, requireSession } from "../middleware/auth";
import { parseJson, parseJsonOrEmpty } from "../middleware/body";
import type { AppEnv } from "../middleware/types";
import { deleteUserCascade } from "../services/delete-cascade";
import type { UserRow } from "../types";
import { rowToAdminUserPublic, rowToInvitePublic } from "../types";

const r = new Hono<AppEnv>();

r.use("*", requireSession, requireAdmin);

// ─── Users ───────────────────────────────────────────────────────────
r.get("/users", async (c) => {
  const rows = await usersRepo.listAllAdmin(c.env);
  return jsonResponse({ users: rows.map(rowToAdminUserPublic) });
});

interface PatchUserBody {
  isAdmin?: boolean;
  disabled?: boolean;
  firstName?: string;
  lastName?: string;
}

function trimName(s: unknown, max = 80): string {
  if (typeof s !== "string") return "";
  return s.trim().slice(0, max);
}

r.patch("/users/:id", async (c) => {
  const session = c.get("session");
  const targetId = c.req.param("id");
  if (targetId === session.userId) {
    return errorResponse(400, "cannot modify your own admin/disabled status");
  }
  const body = await parseJson<PatchUserBody>(c);
  if (body instanceof Response) return body;

  const target = await usersRepo.findById(c.env, targetId);
  if (!target) return errorResponse(404, "user not found");

  const patch: Partial<UserRow> = {};
  if (typeof body.isAdmin === "boolean") patch.is_admin = body.isAdmin;
  if (typeof body.disabled === "boolean") patch.disabled = body.disabled;
  if (typeof body.firstName === "string") patch.first_name = trimName(body.firstName);
  if (typeof body.lastName === "string") patch.last_name = trimName(body.lastName);
  if (Object.keys(patch).length === 0) return errorResponse(400, "no fields to update");
  patch.updated_at = now();

  await usersRepo.update(c.env, targetId, patch);
  const updated = await usersRepo.findByIdAdmin(c.env, targetId);
  if (!updated) return errorResponse(404, "user not found");
  return jsonResponse(rowToAdminUserPublic(updated));
});

r.delete("/users/:id", async (c) => {
  const session = c.get("session");
  const targetId = c.req.param("id");
  if (targetId === session.userId) {
    return errorResponse(400, "cannot delete yourself");
  }
  const target = await usersRepo.findById(c.env, targetId);
  if (!target) return errorResponse(404, "user not found");
  await deleteUserCascade(c.env, targetId);
  return jsonResponse({ ok: true });
});

// ─── Invites ─────────────────────────────────────────────────────────
r.get("/invites", async (c) => {
  const rows = await invitesRepo.listAllAdmin(c.env);
  const ts = now();
  return jsonResponse({ invites: rows.map((row) => rowToInvitePublic(row, ts)) });
});

interface CreateInviteBody {
  expiresInHours?: number | null;
}

r.post("/invites", async (c) => {
  const session = c.get("session");
  const body = await parseJsonOrEmpty<CreateInviteBody>(c);

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
  await invitesRepo.insert(c.env, {
    token,
    created_by: session.userId,
    created_at: ts,
    expires_at: expiresAt,
  });

  // Origin used to construct the share URL. Falls back to the request's
  // Origin header for the rare case where the URL parser couldn't pin
  // it down (e.g. proxied behind a reverse proxy that strips host).
  const origin = new URL(c.req.url).origin || c.req.header("origin") || null;
  const url = origin ? `${origin}/invite/${token}` : `/invite/${token}`;
  return jsonResponse({ token, url, expiresAt, createdAt: ts });
});

r.delete("/invites/:token", async (c) => {
  const token = c.req.param("token");
  const meta = await invitesRepo.findRevokeMeta(c.env, token);
  if (!meta) return errorResponse(404, "invite not found");
  if (meta.used_at) return errorResponse(409, "invite already used");
  await invitesRepo.revoke(c.env, token);
  return jsonResponse({ ok: true });
});

export default r;
