// Polymorphic share tokens.
//
// A `shares` row grants public, anonymous access to either a file or a
// folder subtree, at read or write permission. Anyone holding the token
// can act on the linked target. Tokens are independent of the session
// cookie; the token IS the credential.
//
// Owner-side endpoints (auth required):
//   POST   /api/files/:id/shares
//   POST   /api/folders/:id/shares
//   GET    /api/files/:id/shares
//   GET    /api/folders/:id/shares
//   GET    /api/shares                    (all of caller's shares)
//   PATCH  /api/shares/:token             (edit label/permission/expiry/download)
//   POST   /api/shares/:token/rotate      (revoke + reissue with same settings)
//   DELETE /api/files/:id/shares/:token
//   DELETE /api/folders/:id/shares/:token
//   DELETE /api/shares/:token
//
// Public endpoints (no auth):
//   GET  /api/share/:token                (file blob, or folder listing)
//   GET  /api/share/:token/thumb          (file-share only)
//   GET  /api/share/:token/download       (file-share only)
//   PUT  /api/share/:token                (file-share write)
//   GET  /api/share/:token/files/:fileId
//   GET  /api/share/:token/files/:fileId/thumb
//   GET  /api/share/:token/files/:fileId/download
//   PUT  /api/share/:token/files/:fileId         (folder-share write)
//   POST /api/share/:token/files                 (folder-share write)
//   GET  /api/share/:token/folders               (folder-share subtree listing)

import { and, count, desc, eq, gt, inArray, isNull, or, sql } from "drizzle-orm";
import { getDb, t } from "./db/client";
import {
  createFileInFolder,
  deleteFile as deleteOwnedFile,
  loadRowAnyOwner,
  putFile,
  streamFileBody,
  thumbKey,
} from "./files";
import {
  fileInFolderSubtree,
  folderInSubtree,
  listSubtreeFolders,
  loadFilesInFolders,
} from "./folders";
import { collectTagsForMany } from "./tags";
import type {
  Env,
  FilePreview,
  FolderRow,
  SharePermission,
  SharePublic,
  ShareRow,
  ShareTargetType,
} from "./types";
import {
  isShareActive,
  normalizeFileKind,
  rowToFolderMeta,
  rowToMeta,
  rowToSharePublic,
} from "./types";
import { errorResponse, generateShareLabel, jsonResponse, newToken, now } from "./util";

// ─── Owner-side helpers ────────────────────────────────────────────────
async function ensureOwnsFile(env: Env, owner: string, fileId: string): Promise<boolean> {
  const db = getDb(env);
  const r = await db
    .select({ id: t.files.id })
    .from(t.files)
    .where(and(eq(t.files.id, fileId), eq(t.files.owner, owner)))
    .get();
  return !!r;
}

async function ensureOwnsFolder(env: Env, owner: string, folderId: string): Promise<boolean> {
  const db = getDb(env);
  const r = await db
    .select({ id: t.folders.id })
    .from(t.folders)
    .where(and(eq(t.folders.id, folderId), eq(t.folders.owner, owner)))
    .get();
  return !!r;
}

interface CreateShareBody {
  permission?: SharePermission;
  allowDownload?: boolean;
  expiresAt?: number | null;
  label?: string | null;
}

async function createShareRow(
  env: Env,
  owner: string,
  targetType: ShareTargetType,
  targetId: string,
  body: CreateShareBody,
): Promise<ShareRow> {
  const permission: SharePermission = body.permission === "write" ? "write" : "read";
  // Write shares always allow download; read shares default to allowing it.
  const allowDownload = permission === "write" ? true : body.allowDownload !== false;
  const expiresAt =
    body.expiresAt !== undefined && body.expiresAt !== null && Number.isFinite(body.expiresAt)
      ? Number(body.expiresAt)
      : null;
  // The owner's label takes priority; if they didn't type one (or only
  // whitespace), fall back to a generated petname ("amber-fox-37") so
  // each row has a memorable identity in the dialog and on the /shares
  // page. Cosmetic only — the URL token is independent.
  const trimmedLabel = typeof body.label === "string" ? body.label.trim().slice(0, 200) : "";
  const label = trimmedLabel.length > 0 ? trimmedLabel : generateShareLabel();
  const token = newToken();
  const ts = now();
  const db = getDb(env);
  await db
    .insert(t.shares)
    .values({
      token,
      owner,
      target_type: targetType,
      target_id: targetId,
      permission,
      allow_download: allowDownload,
      label,
      created_at: ts,
      expires_at: expiresAt,
    })
    .run();
  return {
    token,
    owner,
    target_type: targetType,
    target_id: targetId,
    permission,
    allow_download: allowDownload,
    label,
    created_at: ts,
    expires_at: expiresAt,
    revoked_at: null,
    last_accessed_at: null,
  };
}

// ─── Owner: create / list / revoke ────────────────────────────────────
export async function createFileShare(
  req: Request,
  env: Env,
  owner: string,
  fileId: string,
): Promise<Response> {
  if (!(await ensureOwnsFile(env, owner, fileId))) return errorResponse(404, "file not found");
  let body: CreateShareBody = {};
  try {
    body = (await req.json()) as CreateShareBody;
  } catch {
    /* defaults are fine */
  }
  const row = await createShareRow(env, owner, "file", fileId, body);
  return jsonResponse(rowToSharePublic(row));
}

export async function createFolderShare(
  req: Request,
  env: Env,
  owner: string,
  folderId: string,
): Promise<Response> {
  if (!(await ensureOwnsFolder(env, owner, folderId)))
    return errorResponse(404, "folder not found");
  let body: CreateShareBody = {};
  try {
    body = (await req.json()) as CreateShareBody;
  } catch {
    /* defaults */
  }
  const row = await createShareRow(env, owner, "folder", folderId, body);
  return jsonResponse(rowToSharePublic(row));
}

export async function listFileShares(env: Env, owner: string, fileId: string): Promise<Response> {
  if (!(await ensureOwnsFile(env, owner, fileId))) return errorResponse(404, "file not found");
  return await listSharesForTarget(env, owner, "file", fileId);
}

export async function listFolderShares(
  env: Env,
  owner: string,
  folderId: string,
): Promise<Response> {
  if (!(await ensureOwnsFolder(env, owner, folderId)))
    return errorResponse(404, "folder not found");
  return await listSharesForTarget(env, owner, "folder", folderId);
}

async function listSharesForTarget(
  env: Env,
  owner: string,
  targetType: ShareTargetType,
  targetId: string,
): Promise<Response> {
  const db = getDb(env);
  const rows = await db
    .select()
    .from(t.shares)
    .where(
      and(
        eq(t.shares.owner, owner),
        eq(t.shares.target_type, targetType),
        eq(t.shares.target_id, targetId),
      ),
    )
    .orderBy(desc(t.shares.created_at))
    .all();
  const tokens: SharePublic[] = rows.filter((r) => !r.revoked_at).map((r) => rowToSharePublic(r));
  return jsonResponse({ tokens });
}

// All of the caller's shares, joined with target name for the admin list.
export async function listAllShares(env: Env, owner: string): Promise<Response> {
  const db = getDb(env);
  const rows = await db
    .select({
      share: t.shares,
      target_name: sql<string | null>`CASE ${t.shares.target_type}
        WHEN 'file'   THEN ${t.files.name}
        WHEN 'folder' THEN ${t.folders.name}
      END`,
    })
    .from(t.shares)
    .leftJoin(t.files, and(eq(t.shares.target_type, "file"), eq(t.files.id, t.shares.target_id)))
    .leftJoin(
      t.folders,
      and(eq(t.shares.target_type, "folder"), eq(t.folders.id, t.shares.target_id)),
    )
    .where(and(eq(t.shares.owner, owner), isNull(t.shares.revoked_at)))
    .orderBy(desc(t.shares.created_at))
    .all();
  const shares: SharePublic[] = rows.map((r) =>
    rowToSharePublic(r.share, r.target_name ?? undefined),
  );
  return jsonResponse({ shares });
}

export async function revokeShareGeneric(
  env: Env,
  owner: string,
  token: string,
): Promise<Response> {
  // Soft-revoke so we keep an audit-friendly history; cleanup happens on
  // owner delete (user deletion cascades). Hard delete also fine, but
  // soft is harmless and lets the UI distinguish revoked.
  const ts = now();
  const db = getDb(env);
  const result = await db
    .update(t.shares)
    .set({ revoked_at: ts })
    .where(and(eq(t.shares.token, token), eq(t.shares.owner, owner), isNull(t.shares.revoked_at)))
    .run();
  if ((result.meta?.changes ?? 0) === 0) return errorResponse(404, "share not found");
  return jsonResponse({ ok: true });
}

// ─── Owner: edit / rotate ────────────────────────────────────────────
//
// Edit mutates an existing share row in place — the URL stays valid.
// Rotate revokes the row and creates a fresh one with the same settings,
// returning a new token. Use rotate to recover from a leaked URL; use
// edit for everything else (extending expiry, fixing the label, flipping
// permissions / download).

interface UpdateShareBody {
  permission?: SharePermission;
  // `null` clears expiry, a number replaces it, `undefined` leaves alone.
  expiresAt?: number | null;
  // `null` clears the label, a string replaces it, `undefined` leaves alone.
  label?: string | null;
  allowDownload?: boolean;
}

export async function updateShareGeneric(
  req: Request,
  env: Env,
  owner: string,
  token: string,
): Promise<Response> {
  let body: UpdateShareBody = {};
  try {
    body = (await req.json()) as UpdateShareBody;
  } catch {
    /* defaults are fine — empty body is a no-op */
  }

  const db = getDb(env);
  const row = await db
    .select()
    .from(t.shares)
    .where(and(eq(t.shares.token, token), eq(t.shares.owner, owner)))
    .get();
  if (!row) return errorResponse(404, "share not found");
  // Revoked shares cannot be edited (the row is tombstoned). Expired
  // shares CAN be edited — the common case is the user wanting to
  // extend the expiry on a link they're still using.
  if (row.revoked_at) return errorResponse(410, "share is revoked");

  // Resolve the next state. Each field is independent: undefined leaves
  // it alone, a value replaces it, `null` is the explicit clear for
  // nullable fields.
  const nextPermission: SharePermission =
    body.permission === "read" || body.permission === "write" ? body.permission : row.permission;

  // Write shares always allow download (mirrors create). For read shares,
  // honour an explicit boolean; otherwise keep the current value.
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

  await db
    .update(t.shares)
    .set({
      permission: nextPermission,
      allow_download: nextAllowDownload,
      expires_at: nextExpiresAt,
      label: nextLabel,
    })
    .where(and(eq(t.shares.token, token), eq(t.shares.owner, owner)))
    .run();

  const updated: ShareRow = {
    ...row,
    permission: nextPermission,
    allow_download: nextAllowDownload,
    expires_at: nextExpiresAt,
    label: nextLabel,
  };
  return jsonResponse(rowToSharePublic(updated));
}

export async function rotateShareGeneric(
  env: Env,
  owner: string,
  token: string,
): Promise<Response> {
  const db = getDb(env);
  const row = await db
    .select()
    .from(t.shares)
    .where(and(eq(t.shares.token, token), eq(t.shares.owner, owner)))
    .get();
  if (!row) return errorResponse(404, "share not found");
  // Revoked shares cannot be rotated (the row is tombstoned). Expired
  // shares CAN — rotating gives the user a fresh URL with the same
  // settings without forcing them to recreate the share from scratch.
  if (row.revoked_at) return errorResponse(410, "share is revoked");

  const ts = now();
  const newTokenStr = newToken();
  // Two writes: revoke the old row, insert a new row with the same
  // settings. We don't rely on D1 transactions — both rows belong to
  // the same owner; even on partial failure the worst case is a new
  // row exists alongside an active old row, which the user can manually
  // revoke. We still issue the writes via `db.batch` to keep them
  // atomic where supported.
  await db.batch([
    db
      .update(t.shares)
      .set({ revoked_at: ts })
      .where(and(eq(t.shares.token, token), eq(t.shares.owner, owner))),
    db.insert(t.shares).values({
      token: newTokenStr,
      owner,
      target_type: row.target_type,
      target_id: row.target_id,
      permission: row.permission,
      allow_download: row.allow_download,
      label: row.label,
      created_at: ts,
      expires_at: row.expires_at,
    }),
  ]);

  const fresh: ShareRow = {
    token: newTokenStr,
    owner,
    target_type: row.target_type,
    target_id: row.target_id,
    permission: row.permission,
    allow_download: row.allow_download,
    label: row.label,
    created_at: ts,
    expires_at: row.expires_at,
    revoked_at: null,
    last_accessed_at: null,
  };
  return jsonResponse({
    old: { token: row.token },
    new: rowToSharePublic(fresh),
  });
}

// ─── Public helper: count active shares per target ────────────────────
// Used by `worker/files.ts` and `worker/folders.ts` to populate
// `activeShareCount` on each list row so the explorer can show a
// "shared" pill without a per-card round trip. Single grouped query;
// returns a Map default-0.
export async function countActiveSharesForTargets(
  env: Env,
  owner: string,
  targetType: ShareTargetType,
  ids: string[],
): Promise<Map<string, number>> {
  if (ids.length === 0) return new Map();
  const db = getDb(env);
  const nowMs = Date.now();
  const rows = await db
    .select({ id: t.shares.target_id, n: count() })
    .from(t.shares)
    .where(
      and(
        eq(t.shares.owner, owner),
        eq(t.shares.target_type, targetType),
        inArray(t.shares.target_id, ids),
        isNull(t.shares.revoked_at),
        or(isNull(t.shares.expires_at), gt(t.shares.expires_at, nowMs)),
      ),
    )
    .groupBy(t.shares.target_id)
    .all();
  const map = new Map<string, number>();
  for (const r of rows) map.set(r.id, r.n);
  return map;
}

export async function revokeFileShare(
  env: Env,
  owner: string,
  fileId: string,
  token: string,
): Promise<Response> {
  if (!(await ensureOwnsFile(env, owner, fileId))) return errorResponse(404, "file not found");
  return await revokeShareGeneric(env, owner, token);
}

export async function revokeFolderShare(
  env: Env,
  owner: string,
  folderId: string,
  token: string,
): Promise<Response> {
  if (!(await ensureOwnsFolder(env, owner, folderId)))
    return errorResponse(404, "folder not found");
  return await revokeShareGeneric(env, owner, token);
}

// ─── Token resolution ─────────────────────────────────────────────────
async function resolveToken(env: Env, token: string): Promise<ShareRow | null> {
  const db = getDb(env);
  const row = await db.select().from(t.shares).where(eq(t.shares.token, token)).get();
  if (!row) return null;
  if (!isShareActive(row, Date.now())) return null;
  return row;
}

function touchAccess(env: Env, token: string, ctx: ExecutionContext | null): void {
  const db = getDb(env);
  const p = db
    .update(t.shares)
    .set({ last_accessed_at: now() })
    .where(eq(t.shares.token, token))
    .run();
  if (ctx) ctx.waitUntil(p.then(() => undefined).catch(() => undefined));
}

// ─── Public: file-share endpoints ────────────────────────────────────
// GET /api/share/:token — file blob (file-share) or folder listing (folder-share).
export async function getViaShareToken(
  env: Env,
  token: string,
  ctx: ExecutionContext | null,
): Promise<Response> {
  const tk = await resolveToken(env, token);
  if (!tk) return errorResponse(404, "invalid or expired token");
  touchAccess(env, token, ctx);
  if (tk.target_type === "file") {
    const file = await loadRowAnyOwner(env, tk.target_id);
    if (!file) return errorResponse(404, "file not found");
    const resp = await streamFileBody(env, file);
    const merged = new Headers(resp.headers);
    merged.set("x-share-target-type", "file");
    merged.set("x-share-permission", tk.permission);
    merged.set("x-share-allow-download", tk.allow_download ? "1" : "0");
    return new Response(resp.body, { status: resp.status, headers: merged });
  }
  // Folder share — return a subtree listing.
  const resp = await renderFolderShareListing(env, tk);
  const merged = new Headers(resp.headers);
  merged.set("x-share-target-type", "folder");
  merged.set("x-share-permission", tk.permission);
  merged.set("x-share-allow-download", tk.allow_download ? "1" : "0");
  return new Response(resp.body, { status: resp.status, headers: merged });
}

async function renderFolderShareListing(env: Env, tk: ShareRow): Promise<Response> {
  const owner = tk.owner;
  const rootId = tk.target_id;
  const folders = await listSubtreeFolders(env, owner, rootId);
  if (folders.length === 0) return errorResponse(404, "folder not found");
  // The first row is the root folder per `listSubtreeFolders` ordering, but
  // we don't rely on order — find by id.
  const rootRow: FolderRow = folders.find((f) => f.id === rootId) || folders[0];
  const folderIds = folders.map((f) => f.id);
  const files = await loadFilesInFolders(env, owner, folderIds);
  const fileTags = await collectTagsForMany(
    env,
    "file",
    files.map((s) => s.id),
  );
  const folderTags = await collectTagsForMany(env, "folder", folderIds);

  // Compute per-folder top-3 previews (most recently updated files).
  // The full files array is already in memory — doing it client-side
  // here is cheaper than another DB query.
  const previewsByFolder = new Map<string, FilePreview[]>();
  const sortedFiles = [...files].sort((a, b) => b.updated_at - a.updated_at);
  for (const s of sortedFiles) {
    if (!s.folder_id) continue;
    const arr = previewsByFolder.get(s.folder_id) ?? [];
    if (arr.length >= 3) continue;
    arr.push({
      id: s.id,
      kind: s.kind,
      hasThumb: s.has_thumb,
      thumbUpdatedAt: s.thumb_updated_at,
    });
    previewsByFolder.set(s.folder_id, arr);
  }

  // Scrub parent_id on the root so the public client doesn't see the
  // owner's outer hierarchy.
  const folderOut = folders.map((f) => {
    const parent = f.id === rootId ? null : f.parent_id;
    return rowToFolderMeta(
      { ...f, parent_id: parent },
      {
        tags: folderTags.get(f.id) ?? [],
        fileCount: files.filter((s) => s.folder_id === f.id).length,
        subfolderCount: folders.filter((c) => c.parent_id === f.id).length,
        previews: previewsByFolder.get(f.id) ?? [],
      },
    );
  });

  return jsonResponse({
    share: {
      token: tk.token,
      permission: tk.permission,
      allowDownload: tk.allow_download,
      label: tk.label,
    },
    root: rowToFolderMeta(
      { ...rootRow, parent_id: null },
      {
        tags: folderTags.get(rootRow.id) ?? [],
        fileCount: files.filter((s) => s.folder_id === rootRow.id).length,
        subfolderCount: folders.filter((c) => c.parent_id === rootRow.id).length,
        previews: previewsByFolder.get(rootRow.id) ?? [],
      },
    ),
    folders: folderOut,
    files: files.map((s) => rowToMeta(s, fileTags.get(s.id) ?? [])),
  });
}

export async function getThumbViaShareToken(
  env: Env,
  token: string,
  ctx: ExecutionContext | null,
  req?: Request,
): Promise<Response> {
  const tk = await resolveToken(env, token);
  if (!tk) return errorResponse(404, "invalid or expired token");
  if (tk.target_type !== "file") return errorResponse(404, "no thumbnail");
  touchAccess(env, token, ctx);

  // Content-addressed via `?v=<thumbUpdatedAt>` from the client; safe to
  // cache at the edge + browser. Same reasoning as `getThumb`.
  const cache = caches.default;
  if (req) {
    const cached = await cache.match(req);
    if (cached) return cached;
  }

  const file = await loadRowAnyOwner(env, tk.target_id);
  if (!file?.has_thumb) return errorResponse(404, "no thumbnail");
  const obj = await env.R2.get(thumbKey(file.id));
  if (!obj) return errorResponse(404, "no thumbnail");
  const resp = new Response(obj.body, {
    headers: {
      "content-type": "image/svg+xml; charset=utf-8",
      "cache-control": "private, max-age=31536000, immutable",
      etag: obj.httpEtag,
    },
  });
  if (req && ctx) ctx.waitUntil(cache.put(req, resp.clone()));
  return resp;
}

export async function downloadViaShareToken(
  env: Env,
  token: string,
  ctx: ExecutionContext | null,
): Promise<Response> {
  const tk = await resolveToken(env, token);
  if (!tk) return errorResponse(404, "invalid or expired token");
  if (tk.target_type !== "file") return errorResponse(404, "not a file share");
  if (!tk.allow_download) return errorResponse(403, "downloads disabled for this share");
  touchAccess(env, token, ctx);
  const file = await loadRowAnyOwner(env, tk.target_id);
  if (!file) return errorResponse(404, "file not found");
  return await streamFileBody(env, file, { download: true });
}

export async function putViaShareToken(req: Request, env: Env, token: string): Promise<Response> {
  const tk = await resolveToken(env, token);
  if (!tk) return errorResponse(404, "invalid or expired token");
  if (tk.target_type !== "file") return errorResponse(404, "use /files/:id under this token");
  if (tk.permission !== "write") return errorResponse(403, "read-only token");
  const file = await loadRowAnyOwner(env, tk.target_id);
  if (!file) return errorResponse(404, "file not found");
  return await putFile(req, env, file.owner, file.id);
}

// ─── Public: folder-share scoped endpoints ────────────────────────────
async function ensureFolderShareCoversFile(
  env: Env,
  tk: ShareRow,
  fileId: string,
): Promise<boolean> {
  if (tk.target_type !== "folder") return false;
  return await fileInFolderSubtree(env, tk.owner, fileId, tk.target_id);
}

export async function getFolderShareFile(
  env: Env,
  token: string,
  fileId: string,
  ctx: ExecutionContext | null,
): Promise<Response> {
  const tk = await resolveToken(env, token);
  if (!tk) return errorResponse(404, "invalid or expired token");
  if (!(await ensureFolderShareCoversFile(env, tk, fileId))) {
    return errorResponse(404, "file not in shared folder");
  }
  touchAccess(env, token, ctx);
  const file = await loadRowAnyOwner(env, fileId);
  if (!file) return errorResponse(404, "file not found");
  const resp = await streamFileBody(env, file);
  const merged = new Headers(resp.headers);
  merged.set("x-share-permission", tk.permission);
  merged.set("x-share-allow-download", tk.allow_download ? "1" : "0");
  return new Response(resp.body, { status: resp.status, headers: merged });
}

export async function getFolderShareFileThumb(
  env: Env,
  token: string,
  fileId: string,
  ctx: ExecutionContext | null,
  req?: Request,
): Promise<Response> {
  const tk = await resolveToken(env, token);
  if (!tk) return errorResponse(404, "invalid or expired token");
  if (!(await ensureFolderShareCoversFile(env, tk, fileId))) {
    return errorResponse(404, "file not in shared folder");
  }
  touchAccess(env, token, ctx);

  const cache = caches.default;
  if (req) {
    const cached = await cache.match(req);
    if (cached) return cached;
  }

  const file = await loadRowAnyOwner(env, fileId);
  if (!file?.has_thumb) return errorResponse(404, "no thumbnail");
  const obj = await env.R2.get(thumbKey(file.id));
  if (!obj) return errorResponse(404, "no thumbnail");
  const resp = new Response(obj.body, {
    headers: {
      "content-type": "image/svg+xml; charset=utf-8",
      "cache-control": "private, max-age=31536000, immutable",
      etag: obj.httpEtag,
    },
  });
  if (req && ctx) ctx.waitUntil(cache.put(req, resp.clone()));
  return resp;
}

export async function downloadFolderShareFile(
  env: Env,
  token: string,
  fileId: string,
  ctx: ExecutionContext | null,
): Promise<Response> {
  const tk = await resolveToken(env, token);
  if (!tk) return errorResponse(404, "invalid or expired token");
  if (!tk.allow_download) return errorResponse(403, "downloads disabled for this share");
  if (!(await ensureFolderShareCoversFile(env, tk, fileId))) {
    return errorResponse(404, "file not in shared folder");
  }
  touchAccess(env, token, ctx);
  const file = await loadRowAnyOwner(env, fileId);
  if (!file) return errorResponse(404, "file not found");
  return await streamFileBody(env, file, { download: true });
}

export async function putFolderShareFile(
  req: Request,
  env: Env,
  token: string,
  fileId: string,
): Promise<Response> {
  const tk = await resolveToken(env, token);
  if (!tk) return errorResponse(404, "invalid or expired token");
  if (tk.permission !== "write") return errorResponse(403, "read-only token");
  if (!(await ensureFolderShareCoversFile(env, tk, fileId))) {
    return errorResponse(404, "file not in shared folder");
  }
  return await putFile(req, env, tk.owner, fileId);
}

// POST /api/share/:token/files — create a file inside a folder share.
export async function createFileViaFolderShare(
  req: Request,
  env: Env,
  token: string,
): Promise<Response> {
  const tk = await resolveToken(env, token);
  if (!tk) return errorResponse(404, "invalid or expired token");
  if (tk.target_type !== "folder") return errorResponse(400, "not a folder share");
  if (tk.permission !== "write") return errorResponse(403, "read-only token");
  let body: { name?: string; folderId?: string; kind?: unknown } = {};
  try {
    body = (await req.json()) as typeof body;
  } catch {
    /* defaults */
  }
  const targetFolder = body.folderId || tk.target_id;
  if (!(await folderInSubtree(env, tk.owner, targetFolder, tk.target_id))) {
    return errorResponse(403, "folder not in shared subtree");
  }
  const meta = await createFileInFolder(
    env,
    tk.owner,
    targetFolder,
    body.name || "Untitled",
    normalizeFileKind(body.kind),
  );
  return jsonResponse(meta);
}

// DELETE /api/share/:token/files/:id — delete inside a folder write share.
export async function deleteFileViaFolderShare(
  env: Env,
  token: string,
  fileId: string,
): Promise<Response> {
  const tk = await resolveToken(env, token);
  if (!tk) return errorResponse(404, "invalid or expired token");
  if (tk.permission !== "write") return errorResponse(403, "read-only token");
  if (!(await ensureFolderShareCoversFile(env, tk, fileId))) {
    return errorResponse(404, "file not in shared folder");
  }
  return await deleteOwnedFile(env, tk.owner, fileId);
}

// GET /api/share/:token/folders — list folders in the shared subtree.
export async function listFolderShareFolders(
  env: Env,
  token: string,
  ctx: ExecutionContext | null,
): Promise<Response> {
  const tk = await resolveToken(env, token);
  if (!tk) return errorResponse(404, "invalid or expired token");
  if (tk.target_type !== "folder") return errorResponse(400, "not a folder share");
  touchAccess(env, token, ctx);
  const folders = await listSubtreeFolders(env, tk.owner, tk.target_id);
  const folderTags = await collectTagsForMany(
    env,
    "folder",
    folders.map((f) => f.id),
  );
  const out = folders.map((f) =>
    rowToFolderMeta(
      { ...f, parent_id: f.id === tk.target_id ? null : f.parent_id },
      { tags: folderTags.get(f.id) ?? [] },
    ),
  );
  return jsonResponse({ folders: out });
}
