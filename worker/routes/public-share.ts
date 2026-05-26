// Public, token-gated share endpoints mounted at `/api/share`.
//
// Every route here uses the share-token middleware which:
//   * resolves `:token` against the `shares` table
//   * 404s on missing/expired/revoked
//   * narrows by target type (file vs folder) when requested
//   * fires `last_accessed_at` via `ctx.waitUntil`
//
// The middleware exposes the resolved `ShareRow` on `c.var.share`.

import { Hono } from "hono";
import * as filesRepo from "../db/repos/files";
import * as foldersRepo from "../db/repos/folders";
import * as tagsRepo from "../db/repos/tags";
import { shareRenderPayload, signRender } from "../lib/crypto";
import {
  errorResponse,
  jsonResponse,
  r2ThumbKey,
  serveR2WithCache,
  streamFileResponse,
} from "../lib/responses";
import { parseJsonOrEmpty } from "../middleware/body";
import { requireShareToken } from "../middleware/share-token";
import type { AppEnv } from "../middleware/types";
import { deleteFileCascade } from "../services/delete-cascade";
import { createFileInFolder, putFileBlob } from "../services/file-blob";
import type { FilePreview, FolderRow, ShareRow } from "../types";
import { normalizeFileKind, rowToFolderMeta, rowToMeta } from "../types";

const r = new Hono<AppEnv>();

// ─── Per-route token resolution ────────────────────────────────────
//
// Hono mounts middleware that runs before the matched handler. We
// register `requireShareToken` per-route (rather than `r.use("*", …)`)
// because each endpoint needs slightly different opts (target-type
// narrowing, write requirement, custom 404 messages).

// ─── /api/share/:token ─────────────────────────────────────────────
// File-share: stream the blob with `x-share-*` headers.
// Folder-share: render the subtree listing with the same headers.
r.get("/:token", requireShareToken(), async (c) => {
  const tk = c.get("share");
  if (tk.target_type === "file") {
    const file = await filesRepo.findByIdAnyOwner(c.env, tk.target_id);
    if (!file) return errorResponse(404, "file not found");
    const resp = await streamFileResponse(c.env, file);
    return mergeShareHeaders(resp, tk);
  }
  const resp = await renderFolderShareListing(c.env, tk);
  return mergeShareHeaders(resp, tk);
});

// File-share write.
r.put("/:token", requireShareToken({ target: "file", needsWrite: true }), async (c) => {
  const tk = c.get("share");
  const file = await filesRepo.findByIdAnyOwner(c.env, tk.target_id);
  if (!file) return errorResponse(404, "file not found");
  return await putFileBlob(c.env, file, c.req.raw);
});

// File-share thumbnail (file-share only).
r.get(
  "/:token/thumb",
  requireShareToken({ target: "file", targetMismatchMessage: "no thumbnail" }),
  async (c) => {
    const tk = c.get("share");
    const file = await filesRepo.findByIdAnyOwner(c.env, tk.target_id);
    if (!file?.has_thumb) return errorResponse(404, "no thumbnail");
    return await serveR2WithCache(c.env, c.executionCtx ?? null, c.req.raw, r2ThumbKey(file.id));
  },
);

// POST /api/share/:token/render-session — mint a short-lived signed
// URL prefix for a static-site file behind a file share. The visitor
// is redirected to `prefix + manifest.entry`. Revoking the share
// immediately kills outstanding sessions (the render route re-checks
// `findActive` on every request).
r.post(
  "/:token/render-session",
  requireShareToken({ target: "file", targetMismatchMessage: "not a file share" }),
  async (c) => {
    const tk = c.get("share");
    const file = await filesRepo.findByIdAnyOwner(c.env, tk.target_id);
    if (!file) return errorResponse(404, "file not found");
    if (file.kind !== "static-site") return errorResponse(400, "file is not a static-site");
    const signed = await signRender(c.env.SESSION_SECRET, shareRenderPayload(tk.token, file.id));
    return jsonResponse({
      prefix: `/shared/${tk.token}/${signed.sig}/`,
      expiresAt: signed.expiresAt,
    });
  },
);

// POST /api/share/:token/files/:fileId/render-session — folder-share
// analogue. The folder share must cover the requested file; the file
// itself must be a static-site. URL shape is
// `/shared/:token/files/:fileId/:sig/<relpath>` to disambiguate from
// the file-share URL shape (which has no `files` segment).
r.post(
  "/:token/files/:fileId/render-session",
  requireShareToken({ target: "folder", targetMismatchMessage: "not a folder share" }),
  async (c) => {
    const tk = c.get("share");
    const fileId = c.req.param("fileId");
    if (!fileId) return errorResponse(404, "file not in shared folder");
    if (!(await foldersRepo.fileInSubtree(c.env, tk.owner, fileId, tk.target_id))) {
      return errorResponse(404, "file not in shared folder");
    }
    const file = await filesRepo.findByIdAnyOwner(c.env, fileId);
    if (!file) return errorResponse(404, "file not found");
    if (file.kind !== "static-site") return errorResponse(400, "file is not a static-site");
    const signed = await signRender(c.env.SESSION_SECRET, shareRenderPayload(tk.token, file.id));
    return jsonResponse({
      prefix: `/shared/${tk.token}/files/${file.id}/${signed.sig}/`,
      expiresAt: signed.expiresAt,
    });
  },
);

// File-share download (file-share only, allow_download required).
r.get(
  "/:token/download",
  requireShareToken({ target: "file", targetMismatchMessage: "not a file share" }),
  async (c) => {
    const tk = c.get("share");
    if (!tk.allow_download) return errorResponse(403, "downloads disabled for this share");
    const file = await filesRepo.findByIdAnyOwner(c.env, tk.target_id);
    if (!file) return errorResponse(404, "file not found");
    return await streamFileResponse(c.env, file, { download: true });
  },
);

// ─── /api/share/:token/files (folder-share, write) ────────────────
interface CreateFolderShareFileBody {
  name?: string;
  folderId?: string;
  kind?: unknown;
}

r.post(
  "/:token/files",
  requireShareToken({
    target: "folder",
    targetMismatchMessage: "not a folder share",
    needsWrite: true,
  }),
  async (c) => {
    const tk = c.get("share");
    const body = await parseJsonOrEmpty<CreateFolderShareFileBody>(c);
    const targetFolder = body.folderId || tk.target_id;
    if (!(await foldersRepo.folderInSubtree(c.env, tk.owner, targetFolder, tk.target_id))) {
      return errorResponse(403, "folder not in shared subtree");
    }
    const meta = await createFileInFolder(
      c.env,
      tk.owner,
      targetFolder,
      body.name || "Untitled",
      normalizeFileKind(body.kind),
    );
    return jsonResponse(meta);
  },
);

// ─── /api/share/:token/folders (folder-share listing) ────────────
r.get(
  "/:token/folders",
  requireShareToken({ target: "folder", targetMismatchMessage: "not a folder share" }),
  async (c) => {
    const tk = c.get("share");
    const folders = await foldersRepo.loadSubtree(c.env, tk.owner, tk.target_id);
    const folderTags = await tagsRepo.collectForMany(
      c.env,
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
  },
);

// ─── /api/share/:token/files/:fileId(/thumb|/download)? ──────────
// Folder-share child file endpoints.
async function ensureFolderShareCoversFile(
  env: AppEnv["Bindings"],
  tk: ShareRow,
  fileId: string,
): Promise<boolean> {
  if (tk.target_type !== "folder") return false;
  return await foldersRepo.fileInSubtree(env, tk.owner, fileId, tk.target_id);
}

r.get("/:token/files/:fileId", requireShareToken(), async (c) => {
  const tk = c.get("share");
  const fileId = c.req.param("fileId");
  if (!fileId) return errorResponse(404, "file not in shared folder");
  if (!(await ensureFolderShareCoversFile(c.env, tk, fileId))) {
    return errorResponse(404, "file not in shared folder");
  }
  const file = await filesRepo.findByIdAnyOwner(c.env, fileId);
  if (!file) return errorResponse(404, "file not found");
  const resp = await streamFileResponse(c.env, file);
  const merged = new Headers(resp.headers);
  merged.set("x-share-permission", tk.permission);
  merged.set("x-share-allow-download", tk.allow_download ? "1" : "0");
  return new Response(resp.body, { status: resp.status, headers: merged });
});

r.get("/:token/files/:fileId/thumb", requireShareToken(), async (c) => {
  const tk = c.get("share");
  const fileId = c.req.param("fileId");
  if (!fileId) return errorResponse(404, "file not in shared folder");
  if (!(await ensureFolderShareCoversFile(c.env, tk, fileId))) {
    return errorResponse(404, "file not in shared folder");
  }
  const file = await filesRepo.findByIdAnyOwner(c.env, fileId);
  if (!file?.has_thumb) return errorResponse(404, "no thumbnail");
  return await serveR2WithCache(c.env, c.executionCtx ?? null, c.req.raw, r2ThumbKey(file.id));
});

r.get("/:token/files/:fileId/download", requireShareToken(), async (c) => {
  const tk = c.get("share");
  const fileId = c.req.param("fileId");
  if (!fileId) return errorResponse(404, "file not in shared folder");
  if (!tk.allow_download) return errorResponse(403, "downloads disabled for this share");
  if (!(await ensureFolderShareCoversFile(c.env, tk, fileId))) {
    return errorResponse(404, "file not in shared folder");
  }
  const file = await filesRepo.findByIdAnyOwner(c.env, fileId);
  if (!file) return errorResponse(404, "file not found");
  return await streamFileResponse(c.env, file, { download: true });
});

r.put("/:token/files/:fileId", requireShareToken({ needsWrite: true }), async (c) => {
  const tk = c.get("share");
  const fileId = c.req.param("fileId");
  if (!fileId) return errorResponse(404, "file not in shared folder");
  if (!(await ensureFolderShareCoversFile(c.env, tk, fileId))) {
    return errorResponse(404, "file not in shared folder");
  }
  const file = await filesRepo.findByIdAnyOwner(c.env, fileId);
  if (!file) return errorResponse(404, "file not found");
  return await putFileBlob(c.env, file, c.req.raw);
});

r.delete("/:token/files/:fileId", requireShareToken({ needsWrite: true }), async (c) => {
  const tk = c.get("share");
  const fileId = c.req.param("fileId");
  if (!fileId) return errorResponse(404, "file not in shared folder");
  if (!(await ensureFolderShareCoversFile(c.env, tk, fileId))) {
    return errorResponse(404, "file not in shared folder");
  }
  await deleteFileCascade(c.env, tk.owner, fileId);
  return jsonResponse({ ok: true });
});

// ─── helpers ─────────────────────────────────────────────────────────

function mergeShareHeaders(resp: Response, tk: ShareRow): Response {
  const merged = new Headers(resp.headers);
  merged.set("x-share-target-type", tk.target_type);
  merged.set("x-share-permission", tk.permission);
  merged.set("x-share-allow-download", tk.allow_download ? "1" : "0");
  return new Response(resp.body, { status: resp.status, headers: merged });
}

async function renderFolderShareListing(env: AppEnv["Bindings"], tk: ShareRow): Promise<Response> {
  const owner = tk.owner;
  const rootId = tk.target_id;
  const folders = await foldersRepo.loadSubtree(env, owner, rootId);
  if (folders.length === 0) return errorResponse(404, "folder not found");
  // The first row is the root folder per `loadSubtree` ordering, but we
  // don't rely on order — find by id.
  const rootRow: FolderRow = folders.find((f) => f.id === rootId) || folders[0];
  const folderIds = folders.map((f) => f.id);
  const files = await foldersRepo.loadFilesInFolders(env, owner, folderIds);
  const fileTags = await tagsRepo.collectForMany(
    env,
    "file",
    files.map((s) => s.id),
  );
  const folderTags = await tagsRepo.collectForMany(env, "folder", folderIds);

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

export default r;
