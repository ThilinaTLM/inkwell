// Polymorphic share tokens.
//
// A `shares` row grants public, anonymous access to either a scene or a
// folder subtree, at read or write permission. Anyone holding the token
// can act on the linked target. Tokens are independent of the session
// cookie; the token IS the credential.
//
// Owner-side endpoints (auth required):
//   POST   /api/scenes/:id/shares
//   POST   /api/folders/:id/shares
//   GET    /api/scenes/:id/shares
//   GET    /api/folders/:id/shares
//   GET    /api/shares                    (all of caller's shares)
//   DELETE /api/scenes/:id/shares/:token
//   DELETE /api/folders/:id/shares/:token
//   DELETE /api/shares/:token
//
// Public endpoints (no auth):
//   GET  /api/share/:token                (scene blob, or folder listing)
//   GET  /api/share/:token/thumb          (scene-share only)
//   GET  /api/share/:token/download       (scene-share only)
//   PUT  /api/share/:token                (scene-share write)
//   GET  /api/share/:token/scenes/:sceneId
//   GET  /api/share/:token/scenes/:sceneId/thumb
//   GET  /api/share/:token/scenes/:sceneId/download
//   PUT  /api/share/:token/scenes/:sceneId       (folder-share write)
//   POST /api/share/:token/scenes                (folder-share write)
//   GET  /api/share/:token/folders               (folder-share subtree listing)

import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { getDb, t } from "./db/client";
import {
  folderInSubtree,
  listSubtreeFolders,
  loadScenesInFolders,
  sceneInFolderSubtree,
} from "./folders";
import {
  createSceneInFolder,
  deleteScene as deleteOwnedScene,
  loadRowAnyOwner,
  putScene,
  streamSceneBody,
  thumbKey,
} from "./scenes";
import { collectTagsForMany } from "./tags";
import type {
  Env,
  FolderRow,
  ScenePreview,
  SharePermission,
  SharePublic,
  ShareRow,
  ShareTargetType,
} from "./types";
import { isShareActive, rowToFolderMeta, rowToMeta, rowToSharePublic } from "./types";
import { errorResponse, jsonResponse, newToken, now } from "./util";

// ─── Owner-side helpers ────────────────────────────────────────────────
async function ensureOwnsScene(env: Env, owner: string, sceneId: string): Promise<boolean> {
  const db = getDb(env);
  const r = await db
    .select({ id: t.scenes.id })
    .from(t.scenes)
    .where(and(eq(t.scenes.id, sceneId), eq(t.scenes.owner, owner)))
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
  const label = typeof body.label === "string" ? body.label.slice(0, 200) : null;
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
export async function createSceneShare(
  req: Request,
  env: Env,
  owner: string,
  sceneId: string,
): Promise<Response> {
  if (!(await ensureOwnsScene(env, owner, sceneId))) return errorResponse(404, "scene not found");
  let body: CreateShareBody = {};
  try {
    body = (await req.json()) as CreateShareBody;
  } catch {
    /* defaults are fine */
  }
  const row = await createShareRow(env, owner, "scene", sceneId, body);
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

export async function listSceneShares(env: Env, owner: string, sceneId: string): Promise<Response> {
  if (!(await ensureOwnsScene(env, owner, sceneId))) return errorResponse(404, "scene not found");
  return await listSharesForTarget(env, owner, "scene", sceneId);
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
        WHEN 'scene'  THEN ${t.scenes.name}
        WHEN 'folder' THEN ${t.folders.name}
      END`,
    })
    .from(t.shares)
    .leftJoin(t.scenes, and(eq(t.shares.target_type, "scene"), eq(t.scenes.id, t.shares.target_id)))
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

export async function revokeSceneShare(
  env: Env,
  owner: string,
  sceneId: string,
  token: string,
): Promise<Response> {
  if (!(await ensureOwnsScene(env, owner, sceneId))) return errorResponse(404, "scene not found");
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

// ─── Public: scene-share endpoints ────────────────────────────────────
// GET /api/share/:token — scene blob (scene-share) or folder listing (folder-share).
export async function getViaShareToken(
  env: Env,
  token: string,
  ctx: ExecutionContext | null,
): Promise<Response> {
  const tk = await resolveToken(env, token);
  if (!tk) return errorResponse(404, "invalid or expired token");
  touchAccess(env, token, ctx);
  if (tk.target_type === "scene") {
    const scene = await loadRowAnyOwner(env, tk.target_id);
    if (!scene) return errorResponse(404, "scene not found");
    const resp = await streamSceneBody(env, scene);
    const merged = new Headers(resp.headers);
    merged.set("x-share-target-type", "scene");
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
  const scenes = await loadScenesInFolders(env, owner, folderIds);
  const sceneTags = await collectTagsForMany(
    env,
    "scene",
    scenes.map((s) => s.id),
  );
  const folderTags = await collectTagsForMany(env, "folder", folderIds);

  // Compute per-folder top-2 previews (most recently updated scenes).
  // The full scenes array is already in memory — doing it client-side
  // here is cheaper than another DB query.
  const previewsByFolder = new Map<string, ScenePreview[]>();
  const sortedScenes = [...scenes].sort((a, b) => b.updated_at - a.updated_at);
  for (const s of sortedScenes) {
    if (!s.folder_id) continue;
    const arr = previewsByFolder.get(s.folder_id) ?? [];
    if (arr.length >= 2) continue;
    arr.push({
      id: s.id,
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
        sceneCount: scenes.filter((s) => s.folder_id === f.id).length,
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
        sceneCount: scenes.filter((s) => s.folder_id === rootRow.id).length,
        subfolderCount: folders.filter((c) => c.parent_id === rootRow.id).length,
        previews: previewsByFolder.get(rootRow.id) ?? [],
      },
    ),
    folders: folderOut,
    scenes: scenes.map((s) => rowToMeta(s, sceneTags.get(s.id) ?? [])),
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
  if (tk.target_type !== "scene") return errorResponse(404, "no thumbnail");
  touchAccess(env, token, ctx);

  // Content-addressed via `?v=<thumbUpdatedAt>` from the client; safe to
  // cache at the edge + browser. Same reasoning as `getThumb`.
  const cache = caches.default;
  if (req) {
    const cached = await cache.match(req);
    if (cached) return cached;
  }

  const scene = await loadRowAnyOwner(env, tk.target_id);
  if (!scene?.has_thumb) return errorResponse(404, "no thumbnail");
  const obj = await env.R2.get(thumbKey(scene.id));
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
  if (tk.target_type !== "scene") return errorResponse(404, "not a scene share");
  if (!tk.allow_download) return errorResponse(403, "downloads disabled for this share");
  touchAccess(env, token, ctx);
  const scene = await loadRowAnyOwner(env, tk.target_id);
  if (!scene) return errorResponse(404, "scene not found");
  return await streamSceneBody(env, scene, { download: true });
}

export async function putViaShareToken(req: Request, env: Env, token: string): Promise<Response> {
  const tk = await resolveToken(env, token);
  if (!tk) return errorResponse(404, "invalid or expired token");
  if (tk.target_type !== "scene") return errorResponse(404, "use /scenes/:id under this token");
  if (tk.permission !== "write") return errorResponse(403, "read-only token");
  const scene = await loadRowAnyOwner(env, tk.target_id);
  if (!scene) return errorResponse(404, "scene not found");
  return await putScene(req, env, scene.owner, scene.id);
}

// ─── Public: folder-share scoped endpoints ────────────────────────────
async function ensureFolderShareCoversScene(
  env: Env,
  tk: ShareRow,
  sceneId: string,
): Promise<boolean> {
  if (tk.target_type !== "folder") return false;
  return await sceneInFolderSubtree(env, tk.owner, sceneId, tk.target_id);
}

export async function getFolderShareScene(
  env: Env,
  token: string,
  sceneId: string,
  ctx: ExecutionContext | null,
): Promise<Response> {
  const tk = await resolveToken(env, token);
  if (!tk) return errorResponse(404, "invalid or expired token");
  if (!(await ensureFolderShareCoversScene(env, tk, sceneId))) {
    return errorResponse(404, "scene not in shared folder");
  }
  touchAccess(env, token, ctx);
  const scene = await loadRowAnyOwner(env, sceneId);
  if (!scene) return errorResponse(404, "scene not found");
  const resp = await streamSceneBody(env, scene);
  const merged = new Headers(resp.headers);
  merged.set("x-share-permission", tk.permission);
  merged.set("x-share-allow-download", tk.allow_download ? "1" : "0");
  return new Response(resp.body, { status: resp.status, headers: merged });
}

export async function getFolderShareSceneThumb(
  env: Env,
  token: string,
  sceneId: string,
  ctx: ExecutionContext | null,
  req?: Request,
): Promise<Response> {
  const tk = await resolveToken(env, token);
  if (!tk) return errorResponse(404, "invalid or expired token");
  if (!(await ensureFolderShareCoversScene(env, tk, sceneId))) {
    return errorResponse(404, "scene not in shared folder");
  }
  touchAccess(env, token, ctx);

  const cache = caches.default;
  if (req) {
    const cached = await cache.match(req);
    if (cached) return cached;
  }

  const scene = await loadRowAnyOwner(env, sceneId);
  if (!scene?.has_thumb) return errorResponse(404, "no thumbnail");
  const obj = await env.R2.get(thumbKey(scene.id));
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

export async function downloadFolderShareScene(
  env: Env,
  token: string,
  sceneId: string,
  ctx: ExecutionContext | null,
): Promise<Response> {
  const tk = await resolveToken(env, token);
  if (!tk) return errorResponse(404, "invalid or expired token");
  if (!tk.allow_download) return errorResponse(403, "downloads disabled for this share");
  if (!(await ensureFolderShareCoversScene(env, tk, sceneId))) {
    return errorResponse(404, "scene not in shared folder");
  }
  touchAccess(env, token, ctx);
  const scene = await loadRowAnyOwner(env, sceneId);
  if (!scene) return errorResponse(404, "scene not found");
  return await streamSceneBody(env, scene, { download: true });
}

export async function putFolderShareScene(
  req: Request,
  env: Env,
  token: string,
  sceneId: string,
): Promise<Response> {
  const tk = await resolveToken(env, token);
  if (!tk) return errorResponse(404, "invalid or expired token");
  if (tk.permission !== "write") return errorResponse(403, "read-only token");
  if (!(await ensureFolderShareCoversScene(env, tk, sceneId))) {
    return errorResponse(404, "scene not in shared folder");
  }
  return await putScene(req, env, tk.owner, sceneId);
}

// POST /api/share/:token/scenes — create a scene inside a folder share.
export async function createSceneViaFolderShare(
  req: Request,
  env: Env,
  token: string,
): Promise<Response> {
  const tk = await resolveToken(env, token);
  if (!tk) return errorResponse(404, "invalid or expired token");
  if (tk.target_type !== "folder") return errorResponse(400, "not a folder share");
  if (tk.permission !== "write") return errorResponse(403, "read-only token");
  let body: { name?: string; folderId?: string } = {};
  try {
    body = (await req.json()) as typeof body;
  } catch {
    /* defaults */
  }
  const targetFolder = body.folderId || tk.target_id;
  if (!(await folderInSubtree(env, tk.owner, targetFolder, tk.target_id))) {
    return errorResponse(403, "folder not in shared subtree");
  }
  const meta = await createSceneInFolder(env, tk.owner, targetFolder, body.name || "Untitled");
  return jsonResponse(meta);
}

// DELETE /api/share/:token/scenes/:id — delete inside a folder write share.
export async function deleteSceneViaFolderShare(
  env: Env,
  token: string,
  sceneId: string,
): Promise<Response> {
  const tk = await resolveToken(env, token);
  if (!tk) return errorResponse(404, "invalid or expired token");
  if (tk.permission !== "write") return errorResponse(403, "read-only token");
  if (!(await ensureFolderShareCoversScene(env, tk, sceneId))) {
    return errorResponse(404, "scene not in shared folder");
  }
  return await deleteOwnedScene(env, tk.owner, sceneId);
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
