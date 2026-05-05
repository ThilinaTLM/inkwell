// Owner-side share routes (the parts of share/* that require a session).
//
// Three Hono apps exported here:
//   * `sharesRoot` — mounted at `/api/shares`
//   * `fileSharesNested` — mounted at `/api/files/:id/shares`
//   * `folderSharesNested` — mounted at `/api/folders/:id/shares`
//
// The public, token-gated endpoints live in `worker/routes/public-share.ts`.

import { Hono } from "hono";
import * as filesRepo from "../db/repos/files";
import * as foldersRepo from "../db/repos/folders";
import * as sharesRepo from "../db/repos/shares";
import { errorResponse, jsonResponse } from "../lib/responses";
import { requireSession } from "../middleware/auth";
import { parseJsonOrEmpty } from "../middleware/body";
import type { AppEnv } from "../middleware/types";
import { rotateShare } from "../services/share-cascade";
import { type CreateShareBody, createShareRow } from "../services/share-create";
import type { SharePermission, SharePublic, ShareRow } from "../types";
import { rowToSharePublic } from "../types";

// ─── Owner: list / patch / rotate / delete generic ──────────────────
export const sharesRoot = new Hono<AppEnv>();
sharesRoot.use("*", requireSession);

sharesRoot.get("/", async (c) => {
  const owner = c.get("session").userId;
  const shares = await sharesRepo.listAllForOwnerWithTarget(c.env, owner);
  return jsonResponse({ shares });
});

interface UpdateShareBody {
  permission?: SharePermission;
  // `null` clears expiry, a number replaces it, `undefined` leaves alone.
  expiresAt?: number | null;
  // `null` clears the label, a string replaces it, `undefined` leaves alone.
  label?: string | null;
  allowDownload?: boolean;
}

sharesRoot.patch("/:token", async (c) => {
  const owner = c.get("session").userId;
  const token = c.req.param("token");
  const body = await parseJsonOrEmpty<UpdateShareBody>(c);

  const row = await sharesRepo.findByTokenForOwner(c.env, owner, token);
  if (!row) return errorResponse(404, "share not found");
  // Revoked shares cannot be edited (the row is tombstoned). Expired
  // shares CAN be edited — the common case is the user wanting to
  // extend the expiry on a link they're still using.
  if (row.revoked_at) return errorResponse(410, "share is revoked");

  // Resolve the next state. Each field is independent: undefined
  // leaves it alone, a value replaces it, `null` is the explicit clear
  // for nullable fields.
  const nextPermission: SharePermission =
    body.permission === "read" || body.permission === "write" ? body.permission : row.permission;

  // Write shares always allow download (mirrors create). For read
  // shares, honour an explicit boolean; otherwise keep the current
  // value.
  let nextAllowDownload = row.allow_download;
  if (nextPermission === "write") {
    nextAllowDownload = true;
  } else if (typeof body.allowDownload === "boolean") {
    nextAllowDownload = body.allowDownload;
  }

  let nextExpiresAt: number | null = row.expires_at;
  if (body.expiresAt === null) {
    nextExpiresAt = null;
  } else if (typeof body.expiresAt === "number" && Number.isFinite(body.expiresAt)) {
    nextExpiresAt = Number(body.expiresAt);
  }

  let nextLabel: string | null = row.label;
  if (body.label === null) {
    nextLabel = null;
  } else if (typeof body.label === "string") {
    const trimmed = body.label.slice(0, 200);
    nextLabel = trimmed.length > 0 ? trimmed : null;
  }

  await sharesRepo.update(c.env, owner, token, {
    permission: nextPermission,
    allow_download: nextAllowDownload,
    expires_at: nextExpiresAt,
    label: nextLabel,
  });

  const updated: ShareRow = {
    ...row,
    permission: nextPermission,
    allow_download: nextAllowDownload,
    expires_at: nextExpiresAt,
    label: nextLabel,
  };
  return jsonResponse(rowToSharePublic(updated));
});

sharesRoot.post("/:token/rotate", async (c) => {
  const owner = c.get("session").userId;
  const token = c.req.param("token");
  const row = await sharesRepo.findByTokenForOwner(c.env, owner, token);
  if (!row) return errorResponse(404, "share not found");
  // Revoked shares cannot be rotated (the row is tombstoned). Expired
  // shares CAN — rotating gives the user a fresh URL with the same
  // settings without forcing them to recreate the share from scratch.
  if (row.revoked_at) return errorResponse(410, "share is revoked");
  const fresh = await rotateShare(c.env, owner, row);
  return jsonResponse({
    old: { token: row.token },
    new: rowToSharePublic(fresh),
  });
});

sharesRoot.delete("/:token", async (c) => {
  const owner = c.get("session").userId;
  const token = c.req.param("token");
  const ok = await sharesRepo.revoke(c.env, owner, token);
  if (!ok) return errorResponse(404, "share not found");
  return jsonResponse({ ok: true });
});

// ─── Nested under /api/files/:id ────────────────────────────────────
//
// Hono nested routers receive their parent path params via `c.req.param`,
// so `:id` resolves correctly here too.
export const fileSharesNested = new Hono<AppEnv>();
fileSharesNested.use("*", requireSession);

fileSharesNested.get("/", async (c) => {
  const owner = c.get("session").userId;
  const fileId = c.req.param("id");
  if (!fileId) return errorResponse(404, "file not found");
  const row = await filesRepo.findById(c.env, owner, fileId);
  if (!row) return errorResponse(404, "file not found");
  const rows = await sharesRepo.listForTarget(c.env, owner, "file", fileId);
  const tokens: SharePublic[] = rows.filter((r) => !r.revoked_at).map((r) => rowToSharePublic(r));
  return jsonResponse({ tokens });
});

fileSharesNested.post("/", async (c) => {
  const owner = c.get("session").userId;
  const fileId = c.req.param("id");
  if (!fileId) return errorResponse(404, "file not found");
  const row = await filesRepo.findById(c.env, owner, fileId);
  if (!row) return errorResponse(404, "file not found");
  const body = await parseJsonOrEmpty<CreateShareBody>(c);
  const created = await createShareRow(c.env, owner, "file", fileId, body);
  return jsonResponse(rowToSharePublic(created));
});

fileSharesNested.delete("/:token", async (c) => {
  const owner = c.get("session").userId;
  const fileId = c.req.param("id");
  const token = c.req.param("token");
  if (!fileId || !token) return errorResponse(404, "file not found");
  const row = await filesRepo.findById(c.env, owner, fileId);
  if (!row) return errorResponse(404, "file not found");
  const ok = await sharesRepo.revoke(c.env, owner, token);
  if (!ok) return errorResponse(404, "share not found");
  return jsonResponse({ ok: true });
});

// ─── Nested under /api/folders/:id ──────────────────────────────────
export const folderSharesNested = new Hono<AppEnv>();
folderSharesNested.use("*", requireSession);

folderSharesNested.get("/", async (c) => {
  const owner = c.get("session").userId;
  const folderId = c.req.param("id");
  if (!folderId) return errorResponse(404, "folder not found");
  if (!(await foldersRepo.existsForOwner(c.env, owner, folderId))) {
    return errorResponse(404, "folder not found");
  }
  const rows = await sharesRepo.listForTarget(c.env, owner, "folder", folderId);
  const tokens: SharePublic[] = rows.filter((r) => !r.revoked_at).map((r) => rowToSharePublic(r));
  return jsonResponse({ tokens });
});

folderSharesNested.post("/", async (c) => {
  const owner = c.get("session").userId;
  const folderId = c.req.param("id");
  if (!folderId) return errorResponse(404, "folder not found");
  if (!(await foldersRepo.existsForOwner(c.env, owner, folderId))) {
    return errorResponse(404, "folder not found");
  }
  const body = await parseJsonOrEmpty<CreateShareBody>(c);
  const created = await createShareRow(c.env, owner, "folder", folderId, body);
  return jsonResponse(rowToSharePublic(created));
});

folderSharesNested.delete("/:token", async (c) => {
  const owner = c.get("session").userId;
  const folderId = c.req.param("id");
  const token = c.req.param("token");
  if (!folderId || !token) return errorResponse(404, "folder not found");
  if (!(await foldersRepo.existsForOwner(c.env, owner, folderId))) {
    return errorResponse(404, "folder not found");
  }
  const ok = await sharesRepo.revoke(c.env, owner, token);
  if (!ok) return errorResponse(404, "share not found");
  return jsonResponse({ ok: true });
});
