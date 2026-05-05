// Owner-side file routes mounted at `/api/files`.
//
// File shares (`/api/files/:id/shares`) are mounted from the shares
// route module — see `worker/routes/shares.ts`.
//
// R2 layout (historical key prefix `scenes/{id}.json` is preserved —
// see worker/lib/responses.ts and the 0002_files_rename migration):
//   scenes/{id}.json   -- the file blob
//   thumbs/{id}.svg    -- optional SVG thumbnail
//
// Versioning: every successful PUT bumps `version` in D1. Clients
// should send `If-Match: <version>`; mismatch returns 409 with the
// current row.

import { Hono } from "hono";
import * as filesRepo from "../db/repos/files";
import * as foldersRepo from "../db/repos/folders";
import * as sharesRepo from "../db/repos/shares";
import * as tagsRepo from "../db/repos/tags";
import { newId } from "../lib/crypto";
import {
  errorResponse,
  jsonResponse,
  r2FileKey,
  r2ThumbKey,
  serveR2WithCache,
  streamFileResponse,
} from "../lib/responses";
import { now } from "../lib/util";
import { requireSession } from "../middleware/auth";
import { parseJson, parseJsonOrEmpty } from "../middleware/body";
import type { AppEnv } from "../middleware/types";
import { deleteFileCascade } from "../services/delete-cascade";
import {
  MAX_THUMB_BYTES,
  mirrorRenameIntoExcalidrawBlob,
  putFileBlob,
  seedBlobForKind,
  writeR2Blob,
} from "../services/file-blob";
import type { FileKind, FileMeta, FileRow } from "../types";
import { normalizeFileKind, rowToMeta } from "../types";

const r = new Hono<AppEnv>();

r.use("*", requireSession);

// ─── List ────────────────────────────────────────────────────────────
//
// Query params:
//   folderId=<id>     — direct children of one folder
//   folderId=root     — files at the root level (folder_id IS NULL)
//   recursive=1       — combine with folderId=<id> for the whole subtree
//                       (ignored with folderId=root)
//   tag=<name>        — repeatable, AND-intersect by tag names
//   q=<text>          — case-insensitive name LIKE
// No `folderId` param returns every file the caller owns.
r.get("/", async (c) => {
  const owner = c.get("session").userId;
  const params = new URL(c.req.url).searchParams;

  const folderParam = params.get("folderId");
  const recursive = params.get("recursive") === "1";
  const tagFilters = params
    .getAll("tag")
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);
  const q = (params.get("q") || "").trim();

  let rows: FileRow[];
  if (folderParam === "root") {
    rows = await filesRepo.listAtRoot(c.env, owner);
  } else if (folderParam) {
    if (recursive) {
      const ids = await foldersRepo.descendantIds(c.env, owner, folderParam);
      rows = await foldersRepo.loadFilesInFolders(c.env, owner, ids);
    } else {
      rows = await filesRepo.listInFolder(c.env, owner, folderParam);
    }
  } else {
    rows = await filesRepo.listForOwner(c.env, owner);
  }

  if (q) {
    const needle = q.toLowerCase();
    rows = rows.filter((r) => r.name.toLowerCase().includes(needle));
  }

  const tagMap = await tagsRepo.collectForMany(
    c.env,
    "file",
    rows.map((r) => r.id),
  );
  if (tagFilters.length > 0) {
    rows = rows.filter((row) => {
      const t = tagMap.get(row.id) ?? [];
      return tagFilters.every((needle) => t.includes(needle));
    });
  }

  const shareMap = await sharesRepo.countActiveByTarget(
    c.env,
    owner,
    "file",
    rows.map((r) => r.id),
  );

  const out: FileMeta[] = rows.map((row) =>
    rowToMeta(row, tagMap.get(row.id) ?? [], { activeShareCount: shareMap.get(row.id) ?? 0 }),
  );
  return jsonResponse({ files: out });
});

// ─── Create ──────────────────────────────────────────────────────────
interface CreateFileBody {
  name?: string;
  folderId?: string | null;
  tags?: string[];
  kind?: FileKind;
}

r.post("/", async (c) => {
  const owner = c.get("session").userId;
  const body = await parseJsonOrEmpty<CreateFileBody>(c);
  const folderId: string | null = body.folderId ?? null;
  if (folderId !== null) {
    if (!(await foldersRepo.existsForOwner(c.env, owner, folderId))) {
      return errorResponse(404, "folder not found");
    }
  }

  const id = newId();
  const ts = now();
  const name = (body.name || "Untitled").slice(0, 200);
  const kind = normalizeFileKind(body.kind);
  const seed = seedBlobForKind(kind, name);
  const seedBytes = new TextEncoder().encode(JSON.stringify(seed));
  await writeR2Blob(c.env, id, seedBytes);

  await filesRepo.insert(c.env, {
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
  });

  const tags = Array.isArray(body.tags)
    ? await tagsRepo.replaceForEntity(c.env, owner, "file", id, body.tags)
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
});

// ─── Read ────────────────────────────────────────────────────────────
r.get("/:id", async (c) => {
  const owner = c.get("session").userId;
  const id = c.req.param("id");
  const row = await filesRepo.findById(c.env, owner, id);
  if (!row) return errorResponse(404, "file not found");
  return await streamFileResponse(c.env, row, { includeFolderId: true });
});

r.get("/:id/download", async (c) => {
  const owner = c.get("session").userId;
  const id = c.req.param("id");
  const row = await filesRepo.findById(c.env, owner, id);
  if (!row) return errorResponse(404, "file not found");
  return await streamFileResponse(c.env, row, { download: true, includeFolderId: true });
});

// ─── Update (full body) ──────────────────────────────────────────────
//
// Body validation, R2 write, version bump, and JSON response live in
// `services/file-blob.ts#putFileBlob` so the share-token write paths
// can reuse them verbatim.
r.put("/:id", async (c) => {
  const owner = c.get("session").userId;
  const id = c.req.param("id");
  const row = await filesRepo.findById(c.env, owner, id);
  if (!row) return errorResponse(404, "file not found");
  return await putFileBlob(c.env, row, c.req.raw);
});

// ─── Patch (rename / move / retag) ───────────────────────────────────
interface PatchFileBody {
  name?: string;
  folderId?: string | null;
  tags?: string[];
}

r.patch("/:id", async (c) => {
  const owner = c.get("session").userId;
  const id = c.req.param("id");
  const row = await filesRepo.findById(c.env, owner, id);
  if (!row) return errorResponse(404, "file not found");

  const body = await parseJson<PatchFileBody>(c);
  if (body instanceof Response) return body;

  let nextName = row.name;
  let nextFolder: string | null = row.folder_id;

  if (body.name !== undefined) {
    const trimmed = body.name.trim().slice(0, 200);
    if (!trimmed) return errorResponse(400, "name required");
    nextName = trimmed;
  }
  if (body.folderId !== undefined && body.folderId !== row.folder_id) {
    if (body.folderId === null) {
      nextFolder = null;
    } else {
      if (!(await foldersRepo.existsForOwner(c.env, owner, body.folderId))) {
        return errorResponse(404, "folder not found");
      }
      nextFolder = body.folderId;
    }
  }

  const ts = now();
  await filesRepo.updateMeta(c.env, owner, id, {
    name: nextName,
    folder_id: nextFolder,
    updated_at: ts,
  });

  // Mirror the new name into the excalidraw blob's `appState.name`. We
  // deliberately do NOT bump `files.version` here — version is the
  // autosave optimistic-concurrency token, and bumping it would surface
  // as spurious 409s in an open editor mid-rename.
  // Excalidraw-only by design: drawio blobs carry an `mxfile`/`<diagram
  // name="…">` attribute that isn't surfaced in any Inkwell UI, so we
  // keep D1 as the canonical name and leave the XML untouched. Do NOT
  // add a drawio mirror here without first deciding whether the
  // `<diagram>` attr or any host-app metadata should track renames.
  if (body.name !== undefined && nextName !== row.name) {
    await mirrorRenameIntoExcalidrawBlob(c.env, row, nextName);
  }

  const tags = Array.isArray(body.tags)
    ? await tagsRepo.replaceForEntity(c.env, owner, "file", id, body.tags)
    : await tagsRepo.listForEntity(c.env, "file", id);

  return jsonResponse(
    rowToMeta({ ...row, name: nextName, folder_id: nextFolder, updated_at: ts }, tags),
  );
});

// PUT /api/files/:id/tags — replace the tag set.
interface PutTagsBody {
  tags?: unknown;
}

r.put("/:id/tags", async (c) => {
  const owner = c.get("session").userId;
  const id = c.req.param("id");
  const row = await filesRepo.findById(c.env, owner, id);
  if (!row) return errorResponse(404, "file not found");
  const body = await parseJson<PutTagsBody>(c);
  if (body instanceof Response) return body;
  const tags = await tagsRepo.replaceForEntity(c.env, owner, "file", id, body.tags);
  // Bump updated_at so the dashboard re-renders the card.
  const ts = now();
  await filesRepo.updateMeta(c.env, owner, id, { updated_at: ts });
  return jsonResponse({ id, tags, updatedAt: ts });
});

// ─── Delete ──────────────────────────────────────────────────────────
r.delete("/:id", async (c) => {
  const owner = c.get("session").userId;
  const id = c.req.param("id");
  const row = await filesRepo.findById(c.env, owner, id);
  if (!row) return errorResponse(404, "file not found");
  await deleteFileCascade(c.env, owner, id);
  return jsonResponse({ ok: true });
});

// ─── Thumbnails ──────────────────────────────────────────────────────
// putThumb: writes the SVG to R2 and advances `thumb_updated_at` on
// every successful upload (not just the first). The token is the
// cache-bust value the client appends to `<img src=...?v=N>`; bumping
// it on every write is what makes content-addressed URLs work.
r.put("/:id/thumb", async (c) => {
  const owner = c.get("session").userId;
  const id = c.req.param("id");
  const row = await filesRepo.findById(c.env, owner, id);
  if (!row) return errorResponse(404, "file not found");

  const buf = await c.req.raw.arrayBuffer();
  if (buf.byteLength === 0) return errorResponse(400, "empty body");
  if (buf.byteLength > MAX_THUMB_BYTES) return errorResponse(413, "thumbnail too large");

  await c.env.R2.put(r2ThumbKey(id), buf, {
    httpMetadata: { contentType: "image/svg+xml" },
  });
  // Always update the bust token; conditionally flip `has_thumb`. We do
  // not touch `version` or `updated_at` so list ordering and content
  // versioning are unaffected by thumb activity.
  const ts = now();
  await filesRepo.updateMeta(
    c.env,
    owner,
    id,
    row.has_thumb ? { thumb_updated_at: ts } : { has_thumb: true, thumb_updated_at: ts },
  );
  return jsonResponse({ ok: true });
});

// getThumb: served via a content-addressed URL (`?v=<thumbUpdatedAt>`)
// so the response is safe to mark `immutable` for the browser, and we
// can store it in the Cloudflare edge cache. New content => new URL =>
// cold path runs again exactly once.
//
// Pre-existing soft leak: this handler does not re-verify ownership of
// `id` against the caller's session. It's safe today because file IDs
// are unguessable and the session gate runs upstream — but a strict
// owner check would be the principled fix. Documented for follow-up.
r.get("/:id/thumb", async (c) => {
  const id = c.req.param("id");
  return await serveR2WithCache(c.env, c.executionCtx ?? null, c.req.raw, r2ThumbKey(id));
});

// ─── Internal helpers exposed to other route modules ────────────────
//
// `r2FileKey` is exported from lib/responses; share routes import it
// directly. We re-export here only to keep the file-blob R2 layout
// constants in one mental place when reading this module.
export { r2FileKey, r2ThumbKey };

export default r;
