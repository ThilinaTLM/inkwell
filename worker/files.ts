// File CRUD handlers. The full file blob (Excalidraw elements / drawio XML)
// lives in R2; D1 holds only the metadata index.
//
// R2 layout:
//   scenes/{id}.json   -- the file blob (key prefix kept for historical
//                          reasons; renaming would require copying every
//                          blob with no user-visible payoff — see the
//                          0002_files_rename migration)
//   thumbs/{id}.svg    -- optional SVG thumbnail
//
// Ownership is tracked in D1 (`files.owner` → `users.id`); R2 paths are
// flat by id so future ownership changes are metadata-only.
//
// Versioning: every successful PUT bumps `version` in D1. Clients should
// send `If-Match: <version>`; mismatch returns 409 with the current row so
// the client can decide whether to retry or surface the conflict.

import { and, desc, eq, isNull } from "drizzle-orm";
import { getDb, t } from "./db/client";
import { descendantFolderIds, loadFilesInFolders } from "./folders";
import { countActiveSharesForTargets } from "./share";
import { collectTagsForMany, listTagsFor, replaceTagsFor } from "./tags";
import type {
  DrawioFileBlob,
  Env,
  ExcalidrawFileBlob,
  FileBlob,
  FileKind,
  FileMeta,
  FileRow,
} from "./types";
import { normalizeFileKind, rowToMeta } from "./types";
import { assertNever, errorResponse, jsonResponse, newId, now } from "./util";

const MAX_FILE_BYTES = 25 * 1024 * 1024; // 25 MB; embedded images live in `files`
const MAX_THUMB_BYTES = 1 * 1024 * 1024; // 1 MB SVG ceiling

// `scenes/` here is a historical R2 key prefix kept to avoid a blob copy
// during the scenes → files rename. The function name reflects the
// product vocabulary; the storage layout is unchanged.
function r2FileKey(id: string) {
  return `scenes/${id}.json`;
}
function r2ThumbKey(id: string) {
  return `thumbs/${id}.svg`;
}

function seedBlobForKind(kind: FileKind, name: string): FileBlob {
  switch (kind) {
    case "drawio":
      return { kind: "drawio", xml: emptyDrawioXml(name) };
    case "excalidraw":
      return { elements: [], appState: { name }, files: {} };
    default:
      return assertNever(kind);
  }
}

function emptyDrawioXml(name: string): string {
  const safeName = escapeXml(name || "Page-1");
  return `<mxfile host="Inkwell" version="1.0"><diagram id="${newId()}" name="${safeName}"><mxGraphModel dx="1200" dy="800" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="850" pageHeight="1100" math="0" shadow="0"><root><mxCell id="0"/><mxCell id="1" parent="0"/></root></mxGraphModel></diagram></mxfile>`;
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function isDrawioBlob(blob: FileBlob): blob is DrawioFileBlob {
  return (
    (blob as { kind?: unknown }).kind === "drawio" &&
    typeof (blob as { xml?: unknown }).xml === "string"
  );
}

function validateBlobForKind(kind: FileKind, parsed: FileBlob): string | null {
  switch (kind) {
    case "drawio":
      if (!isDrawioBlob(parsed)) return "draw.io blob must include kind=drawio and xml";
      if (!parsed.xml.trim()) return "draw.io xml required";
      return null;
    case "excalidraw":
      if (!Array.isArray((parsed as ExcalidrawFileBlob).elements))
        return "elements must be an array";
      return null;
    default:
      return assertNever(kind);
  }
}

async function parseStoredFileBlob(obj: R2ObjectBody): Promise<FileBlob | null> {
  try {
    return JSON.parse(await obj.text()) as FileBlob;
  } catch {
    return null;
  }
}

function downloadExtensionForKind(kind: FileKind): "excalidraw" | "drawio" {
  switch (kind) {
    case "drawio":
      return "drawio";
    case "excalidraw":
      return "excalidraw";
    default:
      return assertNever(kind);
  }
}

// ─── List ─────────────────────────────────────────────────────────────
// Supports query params:
//   folderId=<id>               — filter to direct children of one folder
//   folderId=root                — filter to files at the root level
//                                  (`folder_id IS NULL`)
//   recursive=1                  — combine with folderId=<id> for the whole
//                                  subtree (ignored with folderId=root)
//   tag=<name> (repeatable)      — AND-intersection by tag names
//   q=<text>                     — case-insensitive name LIKE match
// No `folderId` param at all returns every file the caller owns; that
// mode is used by the Recent and Search views.
export async function listFiles(req: Request, env: Env, owner: string): Promise<Response> {
  const url = new URL(req.url);
  const params = url.searchParams;

  const folderParam = params.get("folderId");
  const recursive = params.get("recursive") === "1";
  const tagFilters = params
    .getAll("tag")
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);
  const q = (params.get("q") || "").trim();

  const db = getDb(env);
  let rows: FileRow[];

  if (folderParam === "root") {
    rows = await db
      .select()
      .from(t.files)
      .where(and(eq(t.files.owner, owner), isNull(t.files.folder_id)))
      .orderBy(desc(t.files.updated_at))
      .limit(1000)
      .all();
  } else if (folderParam) {
    if (recursive) {
      const ids = await descendantFolderIds(env, owner, folderParam);
      rows = await loadFilesInFolders(env, owner, ids);
    } else {
      rows = await db
        .select()
        .from(t.files)
        .where(and(eq(t.files.owner, owner), eq(t.files.folder_id, folderParam)))
        .orderBy(desc(t.files.updated_at))
        .limit(1000)
        .all();
    }
  } else {
    rows = await db
      .select()
      .from(t.files)
      .where(eq(t.files.owner, owner))
      .orderBy(desc(t.files.updated_at))
      .limit(1000)
      .all();
  }

  // Filter by name substring in JS — small dataset; cheap.
  if (q) {
    const needle = q.toLowerCase();
    rows = rows.filter((r) => r.name.toLowerCase().includes(needle));
  }

  // Hydrate tags in one batch.
  const tagMap = await collectTagsForMany(
    env,
    "file",
    rows.map((r) => r.id),
  );

  // AND-filter by tags (intersection).
  if (tagFilters.length > 0) {
    rows = rows.filter((r) => {
      const t = tagMap.get(r.id) ?? [];
      return tagFilters.every((needle) => t.includes(needle));
    });
  }

  // Active share count per file — powers the "shared" pill on cards.
  // One grouped query, indexed on (target_type, target_id).
  const shareMap = await countActiveSharesForTargets(
    env,
    owner,
    "file",
    rows.map((r) => r.id),
  );

  const out: FileMeta[] = rows.map((r) =>
    rowToMeta(r, tagMap.get(r.id) ?? [], { activeShareCount: shareMap.get(r.id) ?? 0 }),
  );
  return jsonResponse({ files: out });
}

// ─── Create ───────────────────────────────────────────────────────────
export async function createFile(req: Request, env: Env, owner: string): Promise<Response> {
  let body: { name?: string; folderId?: string | null; tags?: string[]; kind?: FileKind } = {};
  try {
    body = (await req.json()) as typeof body;
  } catch {
    /* ignore — empty body is fine */
  }
  const db = getDb(env);
  // `folderId` is `null` (or absent) when creating a file at the root.
  const folderId: string | null = body.folderId ?? null;
  if (folderId !== null) {
    const folder = await db
      .select({ id: t.folders.id })
      .from(t.folders)
      .where(and(eq(t.folders.id, folderId), eq(t.folders.owner, owner)))
      .get();
    if (!folder) return errorResponse(404, "folder not found");
  }

  const id = newId();
  const ts = now();
  const name = (body.name || "Untitled").slice(0, 200);
  const kind = normalizeFileKind(body.kind);

  // Seed an empty file so subsequent GETs return something predictable.
  const seed = seedBlobForKind(kind, name);
  const seedBytes = new TextEncoder().encode(JSON.stringify(seed));
  await env.R2.put(r2FileKey(id), seedBytes, {
    httpMetadata: { contentType: "application/json" },
  });

  await db
    .insert(t.files)
    .values({
      id,
      owner,
      folder_id: folderId,
      name,
      kind,
      version: 1,
      size_bytes: seedBytes.byteLength,
      has_thumb: false,
      thumb_updated_at: 0,
      created_at: ts,
      updated_at: ts,
    })
    .run();

  const tags = Array.isArray(body.tags)
    ? await replaceTagsFor(env, owner, "file", id, body.tags)
    : [];

  const meta: FileMeta = {
    id,
    folderId,
    name,
    kind,
    tags,
    version: 1,
    sizeBytes: seedBytes.byteLength,
    hasThumb: false,
    thumbUpdatedAt: 0,
    activeShareCount: 0,
    createdAt: ts,
    updatedAt: ts,
  };
  return jsonResponse(meta);
}

// ─── Read ─────────────────────────────────────────────────────────────
async function loadRow(env: Env, owner: string, id: string): Promise<FileRow | null> {
  const db = getDb(env);
  const row = await db
    .select()
    .from(t.files)
    .where(and(eq(t.files.id, id), eq(t.files.owner, owner)))
    .get();
  return row ?? null;
}

// Used by /api/share/:token too; doesn't filter by owner.
export async function loadRowAnyOwner(env: Env, id: string): Promise<FileRow | null> {
  const db = getDb(env);
  const row = await db.select().from(t.files).where(eq(t.files.id, id)).get();
  return row ?? null;
}

export async function getFile(env: Env, owner: string, id: string): Promise<Response> {
  const row = await loadRow(env, owner, id);
  if (!row) return errorResponse(404, "file not found");
  return await streamFileBody(env, row, { includeFolderId: true });
}

export async function streamFileBody(
  env: Env,
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
    "cache-control": "no-store",
  };
  // Owner-only: file's parent folder, used by the editor's "Back" button
  // to fall back to the right folder on cold deep-links. Omitted on share-
  // token loads so we don't surface owner-side folder IDs to recipients.
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

function safeFilename(name: string): string {
  // Strip path-unsafe characters; keep it ASCII-friendly. Stripping the ASCII
  // control range \x00-\x1F is the explicit intent of this filter.
  // biome-ignore lint/suspicious/noControlCharactersInRegex: see comment above
  const base = name.replace(/[\\/:*?"<>|\x00-\x1F]/g, "_").trim() || "file";
  return base.slice(0, 80);
}

export async function downloadFile(env: Env, owner: string, id: string): Promise<Response> {
  const row = await loadRow(env, owner, id);
  if (!row) return errorResponse(404, "file not found");
  return await streamFileBody(env, row, { download: true, includeFolderId: true });
}

// ─── Update (full body) ───────────────────────────────────────────────
export async function putFile(
  req: Request,
  env: Env,
  owner: string,
  id: string,
): Promise<Response> {
  const row = await loadRow(env, owner, id);
  if (!row) return errorResponse(404, "file not found");

  // Optimistic concurrency: if the client supplies If-Match and it doesn't
  // match the current version, refuse and return the current metadata so
  // the client can decide what to do.
  const ifMatch = req.headers.get("if-match");
  if (ifMatch !== null) {
    const wanted = ifMatch.replace(/^"|"$/g, "");
    if (wanted !== String(row.version)) {
      const tags = await listTagsFor(env, "file", id);
      return jsonResponse(
        { error: "version mismatch", current: rowToMeta(row, tags) },
        { status: 409 },
      );
    }
  }

  const buf = await req.arrayBuffer();
  if (buf.byteLength === 0) return errorResponse(400, "empty body");
  if (buf.byteLength > MAX_FILE_BYTES) return errorResponse(413, "file too large");

  // Light JSON validation — we store as bytes either way, but bad JSON
  // would corrupt subsequent GETs.
  let parsed: FileBlob;
  try {
    parsed = JSON.parse(new TextDecoder().decode(buf));
  } catch {
    return errorResponse(400, "invalid JSON");
  }
  const validationError = validateBlobForKind(row.kind, parsed);
  if (validationError) return errorResponse(400, validationError);

  // The DB row's `name` is the single canonical source of truth for the
  // file's display name; PUT only writes the blob bytes + version /
  // size / updated_at. Renames go through PATCH. Historically PUT used
  // `parsed.appState.name` as the canonical name, but that turned every
  // autosave into a way to silently revert a rename whenever Excalidraw's
  // internal appState.name was stale (e.g. immediately after a rename,
  // before its async initializeScene finished syncing the new name into
  // the canvas state). See plans/scene-rename-persistence.md.

  await env.R2.put(r2FileKey(id), buf, {
    httpMetadata: { contentType: "application/json" },
  });

  const ts = now();
  const nextVersion = row.version + 1;
  const db = getDb(env);
  await db
    .update(t.files)
    .set({
      version: nextVersion,
      size_bytes: buf.byteLength,
      updated_at: ts,
    })
    .where(and(eq(t.files.id, id), eq(t.files.owner, owner)))
    .run();

  const tags = await listTagsFor(env, "file", id);
  // `activeShareCount` on the response is best-effort fresh: this is a
  // single-row save path; one grouped query is fine.
  const shareMap = await countActiveSharesForTargets(env, owner, "file", [id]);
  return jsonResponse({
    id,
    folderId: row.folder_id ?? null,
    name: row.name,
    kind: row.kind,
    tags,
    version: nextVersion,
    sizeBytes: buf.byteLength,
    hasThumb: row.has_thumb,
    thumbUpdatedAt: row.thumb_updated_at,
    activeShareCount: shareMap.get(id) ?? 0,
    createdAt: row.created_at,
    updatedAt: ts,
  } satisfies FileMeta);
}

// ─── Patch (rename / move / retag) ────────────────────────────────────
export async function patchFile(
  req: Request,
  env: Env,
  owner: string,
  id: string,
): Promise<Response> {
  const row = await loadRow(env, owner, id);
  if (!row) return errorResponse(404, "file not found");

  let body: { name?: string; folderId?: string | null; tags?: string[] };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return errorResponse(400, "invalid JSON");
  }

  let nextName = row.name;
  let nextFolder: string | null = row.folder_id;

  if (body.name !== undefined) {
    const trimmed = body.name.trim().slice(0, 200);
    if (!trimmed) return errorResponse(400, "name required");
    nextName = trimmed;
  }
  const db = getDb(env);
  if (body.folderId !== undefined && body.folderId !== row.folder_id) {
    if (body.folderId === null) {
      nextFolder = null;
    } else {
      const folder = await db
        .select({ id: t.folders.id })
        .from(t.folders)
        .where(and(eq(t.folders.id, body.folderId), eq(t.folders.owner, owner)))
        .get();
      if (!folder) return errorResponse(404, "folder not found");
      nextFolder = body.folderId;
    }
  }

  const ts = now();
  await db
    .update(t.files)
    .set({ name: nextName, folder_id: nextFolder, updated_at: ts })
    .where(and(eq(t.files.id, id), eq(t.files.owner, owner)))
    .run();

  // On rename, mirror the new name into the blob's `appState.name` so the
  // R2-backed blob and the D1 row don't drift. This keeps Excalidraw's
  // export-dialog filename and any downloaded `.excalidraw` consistent
  // with the dashboard label until the next autosave reconciles them
  // anyway. Best-effort: a missing or unparseable blob is left alone
  // (the D1 row remains canonical). We deliberately do NOT bump
  // `files.version` here — version is the autosave optimistic-
  // concurrency token, and bumping it would surface as spurious 409s in
  // an open editor mid-rename.
  // Excalidraw-only by design: drawio blobs carry an `mxfile`/`<diagram
  // name="…">` attribute that isn't surfaced in any Inkwell UI, so we
  // keep D1 as the canonical name and leave the XML untouched. Do NOT
  // add a drawio mirror here without first deciding whether the
  // `<diagram>` attr or any host-app metadata should track renames.
  if (row.kind === "excalidraw" && body.name !== undefined && nextName !== row.name) {
    const obj = await env.R2.get(r2FileKey(id));
    if (obj) {
      let parsed: FileBlob | null = null;
      try {
        parsed = JSON.parse(await obj.text()) as FileBlob;
      } catch {
        parsed = null;
      }
      if (parsed) {
        const excalidraw = parsed as ExcalidrawFileBlob;
        const nextBlob: FileBlob = {
          ...excalidraw,
          appState: { ...(excalidraw.appState ?? {}), name: nextName },
        };
        await env.R2.put(r2FileKey(id), JSON.stringify(nextBlob), {
          httpMetadata: { contentType: "application/json" },
        });
      }
    }
  }

  const tags = Array.isArray(body.tags)
    ? await replaceTagsFor(env, owner, "file", id, body.tags)
    : await listTagsFor(env, "file", id);

  return jsonResponse(
    rowToMeta({ ...row, name: nextName, folder_id: nextFolder, updated_at: ts }, tags),
  );
}

// PUT /api/files/:id/tags  — replace the tag set.
export async function putFileTags(
  req: Request,
  env: Env,
  owner: string,
  id: string,
): Promise<Response> {
  const row = await loadRow(env, owner, id);
  if (!row) return errorResponse(404, "file not found");
  let body: { tags?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return errorResponse(400, "invalid JSON");
  }
  const tags = await replaceTagsFor(env, owner, "file", id, body.tags);
  // Bump updated_at so the dashboard re-renders the card.
  const ts = now();
  const db = getDb(env);
  await db
    .update(t.files)
    .set({ updated_at: ts })
    .where(and(eq(t.files.id, id), eq(t.files.owner, owner)))
    .run();
  return jsonResponse({ id, tags, updatedAt: ts });
}

// ─── Delete ───────────────────────────────────────────────────────────
export async function deleteFile(env: Env, owner: string, id: string): Promise<Response> {
  const row = await loadRow(env, owner, id);
  if (!row) return errorResponse(404, "file not found");
  // Cascade explicitly: shares + taggings (D1 doesn't enforce FKs by default).
  const db = getDb(env);
  await db.batch([
    db.delete(t.shares).where(and(eq(t.shares.target_type, "file"), eq(t.shares.target_id, id))),
    db
      .delete(t.taggings)
      .where(and(eq(t.taggings.target_type, "file"), eq(t.taggings.target_id, id))),
    db.delete(t.files).where(and(eq(t.files.id, id), eq(t.files.owner, owner))),
  ]);
  // Best-effort R2 cleanup; swallow errors so a partial state still resolves.
  await Promise.allSettled([env.R2.delete(r2FileKey(id)), env.R2.delete(r2ThumbKey(id))]);
  return jsonResponse({ ok: true });
}

// ─── Thumbnails ───────────────────────────────────────────────────────
// putThumb: writes the SVG to R2 and advances `thumb_updated_at` on every
// successful upload (not just the first). The token is the cache-bust
// value the client appends to `<img src=...?v=N>` — bumping it on every
// write is what makes content-addressed URLs work.
export async function putThumb(
  req: Request,
  env: Env,
  owner: string,
  id: string,
): Promise<Response> {
  const row = await loadRow(env, owner, id);
  if (!row) return errorResponse(404, "file not found");

  const buf = await req.arrayBuffer();
  if (buf.byteLength === 0) return errorResponse(400, "empty body");
  if (buf.byteLength > MAX_THUMB_BYTES) return errorResponse(413, "thumbnail too large");

  await env.R2.put(r2ThumbKey(id), buf, {
    httpMetadata: { contentType: "image/svg+xml" },
  });
  // Always update the bust token; conditionally flip `has_thumb`. We do
  // not touch `version` or `updated_at` so list ordering and content
  // versioning are unaffected by thumb activity.
  const db = getDb(env);
  await db
    .update(t.files)
    .set(row.has_thumb ? { thumb_updated_at: now() } : { has_thumb: true, thumb_updated_at: now() })
    .where(and(eq(t.files.id, id), eq(t.files.owner, owner)))
    .run();
  return jsonResponse({ ok: true });
}

// getThumb: served via a content-addressed URL (`?v=<thumbUpdatedAt>`)
// so the response is safe to mark `immutable` for the browser, and we
// can store it in the Cloudflare edge cache for ~24h. New content =>
// new URL => cold path runs again exactly once.
//
// Cache key is the request URL only (no per-user partitioning), which
// is safe because:
//   1. The auth gate runs upstream of this handler — only authenticated
//      callers ever reach `cache.match`.
//   2. File IDs are unguessable UUIDs.
// Pre-existing soft leak (no owner check here) is documented for
// follow-up; this caching layer doesn't make it worse.
export async function getThumb(
  req: Request,
  env: Env,
  _owner: string,
  id: string,
  ctx: ExecutionContext,
): Promise<Response> {
  const cache = caches.default;
  const cached = await cache.match(req);
  if (cached) return cached;

  const obj = await env.R2.get(r2ThumbKey(id));
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
  ctx.waitUntil(cache.put(req, resp.clone()));
  return resp;
}

// Exposed for share.ts so a token-authenticated request can read the same
// thumbnail without re-implementing the R2 fetch.
export function thumbKey(id: string) {
  return r2ThumbKey(id);
}

// Exposed for the admin user-delete cascade. Returns the R2 key for the
// file blob (still under `scenes/` for historical reasons — see r2FileKey).
export function fileKey(id: string) {
  return r2FileKey(id);
}

// Exposed for share.ts so it can hydrate tags consistently.
export { listTagsFor };

// Helper used by share.ts when creating a file inside a folder share.
export async function createFileInFolder(
  env: Env,
  owner: string,
  folderId: string,
  name: string,
  kind: FileKind = "excalidraw",
): Promise<FileMeta> {
  const id = newId();
  const ts = now();
  const safe = (name || "Untitled").slice(0, 200);
  const seed = seedBlobForKind(kind, safe);
  const seedBytes = new TextEncoder().encode(JSON.stringify(seed));
  await env.R2.put(r2FileKey(id), seedBytes, {
    httpMetadata: { contentType: "application/json" },
  });
  const db = getDb(env);
  await db
    .insert(t.files)
    .values({
      id,
      owner,
      folder_id: folderId,
      name: safe,
      kind,
      version: 1,
      size_bytes: seedBytes.byteLength,
      has_thumb: false,
      thumb_updated_at: 0,
      created_at: ts,
      updated_at: ts,
    })
    .run();
  return {
    id,
    folderId,
    name: safe,
    kind,
    tags: [],
    version: 1,
    sizeBytes: seedBytes.byteLength,
    hasThumb: false,
    thumbUpdatedAt: 0,
    activeShareCount: 0,
    createdAt: ts,
    updatedAt: ts,
  };
}
