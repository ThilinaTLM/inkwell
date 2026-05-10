// HTTP response helpers shared across routes.
//
// Routes return `Response` objects directly (they do not throw HttpError;
// the error middleware handles uncaught exceptions only). These helpers
// exist so handlers can stay one-liners and so behaviorally significant
// response shapes (the `{error}` envelope, R2-cached thumbnails, file
// downloads) live in one place rather than being copy-pasted.

import type { FileBlob, FileKind, FileRow } from "../types";
import { assertNever } from "./util";

export function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...(init.headers || {}),
    },
  });
}

export function errorResponse(status: number, message: string): Response {
  return jsonResponse({ error: message }, { status });
}

// ─── R2-cached thumbnails ─────────────────────────────────────────────
// Used by both the owner endpoint (`/api/files/:id/thumb`) and the
// share-token endpoints (`/api/share/:token/thumb`,
// `/api/share/:token/files/:fileId/thumb`).
//
// Cache key is the request URL only (no per-user partitioning), which
// is safe because:
//   1. The auth gate (or share-token resolution) runs upstream — only
//      authenticated/token-valid callers ever reach this helper.
//   2. File IDs are unguessable.
// Pre-existing soft leak (no owner check on owner-side thumbs) is
// documented for follow-up; this caching layer doesn't make it worse.
export async function serveR2WithCache(
  env: { R2: R2Bucket },
  ctx: ExecutionContext | null,
  req: Request | null,
  key: string,
): Promise<Response> {
  const cache = caches.default;
  if (req) {
    const cached = await cache.match(req);
    if (cached) return cached;
  }
  const obj = await env.R2.get(key);
  if (!obj) return errorResponse(404, "no thumbnail");
  const resp = new Response(obj.body, {
    headers: {
      "content-type": "image/svg+xml; charset=utf-8",
      // Content-addressed URL (`?v=<thumbUpdatedAt>`) ⇒ a given URL
      // never changes content. Safe to mark immutable.
      "cache-control": "private, max-age=31536000, immutable",
      etag: obj.httpEtag,
    },
  });
  if (req && ctx) ctx.waitUntil(cache.put(req, resp.clone()));
  return resp;
}

// ─── File blob streaming ─────────────────────────────────────────────
// Streams the R2-stored file blob to the caller with the canonical set
// of `x-file-*` response headers the SPA reads. Used by:
//   * GET /api/files/:id  (owner)
//   * GET /api/files/:id/download  (owner, with download=true)
//   * GET /api/share/:token  (file share)
//   * GET /api/share/:token/download  (file share)
//   * GET /api/share/:token/files/:fileId  (folder share child)
//   * GET /api/share/:token/files/:fileId/download  (folder share child)
//
// `includeFolderId` is owner-only: we don't surface owner-side folder
// IDs to share-token recipients.
export async function streamFileResponse(
  env: { R2: R2Bucket },
  row: FileRow,
  opts: { download?: boolean; includeFolderId?: boolean } = {},
): Promise<Response> {
  const obj = await env.R2.get(r2FileKey(row.id));
  if (!obj) return errorResponse(404, "file blob missing in R2");
  const headers: Record<string, string> = {
    "content-type": "application/json; charset=utf-8",
    etag: `"${row.version}"`,
    "x-file-id": row.id,
    "x-file-name": encodeURIComponent(row.name),
    "x-file-kind": row.kind,
    "x-file-version": String(row.version),
    "x-file-updated-at": String(row.updated_at),
    "x-file-has-thumb": row.has_thumb ? "1" : "0",
    "cache-control": "no-store",
  };
  if (opts.includeFolderId) {
    headers["x-file-folder-id"] = row.folder_id ?? "";
  }
  if (opts.download) {
    headers["content-disposition"] =
      `attachment; filename="${safeFilename(row.name)}.${downloadExtensionForKind(row.kind)}"`;
    if (row.kind === "drawio") {
      const parsed = await parseStoredFileBlob(obj);
      if (!parsed || !isDrawioBlob(parsed)) return errorResponse(500, "invalid draw.io blob");
      headers["content-type"] = "application/xml; charset=utf-8";
      return new Response(parsed.xml, { headers });
    }
  }
  return new Response(obj.body, { headers });
}

// `scenes/` here is a historical R2 key prefix kept to avoid a blob copy
// during the scenes → files rename. The function name reflects the
// product vocabulary; the storage layout is unchanged.
export function r2FileKey(id: string): string {
  return `scenes/${id}.json`;
}
export function r2ThumbKey(id: string): string {
  return `thumbs/${id}.svg`;
}

function safeFilename(name: string): string {
  // Strip path-unsafe characters; keep it ASCII-friendly. Stripping the ASCII
  // control range \x00-\x1F is the explicit intent of this filter.
  // biome-ignore lint/suspicious/noControlCharactersInRegex: see comment above
  const base = name.replace(/[\\/:*?"<>|\x00-\x1F]/g, "_").trim() || "file";
  return base.slice(0, 80);
}

function downloadExtensionForKind(kind: FileKind): "excalidraw" | "drawio" | "notes.json" {
  switch (kind) {
    case "drawio":
      return "drawio";
    case "excalidraw":
      return "excalidraw";
    case "notes":
      // Notes blobs are BlockNote document JSON; the `.notes.json`
      // double extension keeps both "this is JSON" and "this is an
      // Inkwell notes file" obvious to the OS and to humans. The
      // worker does not convert to Markdown — the SPA exposes a
      // separate client-only "Export as Markdown" path that runs
      // `editor.blocksToMarkdownLossy()` in the browser.
      return "notes.json";
    default:
      return assertNever(kind);
  }
}

function isDrawioBlob(blob: FileBlob): blob is FileBlob & { kind: "drawio"; xml: string } {
  return (
    (blob as { kind?: unknown }).kind === "drawio" &&
    typeof (blob as { xml?: unknown }).xml === "string"
  );
}

export async function parseStoredFileBlob(obj: R2ObjectBody): Promise<FileBlob | null> {
  try {
    return JSON.parse(await obj.text()) as FileBlob;
  } catch {
    return null;
  }
}
