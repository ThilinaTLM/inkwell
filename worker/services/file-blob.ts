// File-blob helpers: seeding new files, validating PUT bodies,
// writing/reading R2.
//
// Pulled out of the old `worker/files.ts` so the route module can stay
// declarative. These functions are pure (modulo R2 + crypto.randomUUID
// inside `newId`) — no Drizzle, no Response.

import * as filesRepo from "../db/repos/files";
import * as sharesRepo from "../db/repos/shares";
import * as tagsRepo from "../db/repos/tags";
import { newId } from "../lib/crypto";
import { errorResponse, jsonResponse, r2FileKey } from "../lib/responses";
import { assertNever, now } from "../lib/util";
import type {
  DrawioFileBlob,
  Env,
  ExcalidrawFileBlob,
  FileBlob,
  FileKind,
  FileMeta,
  FileRow,
} from "../types";
import { rowToMeta } from "../types";

export const MAX_FILE_BYTES = 25 * 1024 * 1024;
export const MAX_THUMB_BYTES = 1 * 1024 * 1024;

// ─── Blob construction ──────────────────────────────────────────────
export function seedBlobForKind(kind: FileKind, name: string): FileBlob {
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

export function isDrawioBlob(blob: FileBlob): blob is DrawioFileBlob {
  return (
    (blob as { kind?: unknown }).kind === "drawio" &&
    typeof (blob as { xml?: unknown }).xml === "string"
  );
}

export function validateBlobForKind(kind: FileKind, parsed: FileBlob): string | null {
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

// ─── R2 writes ──────────────────────────────────────────────────────
export async function writeR2Blob(
  env: Env,
  id: string,
  body: ArrayBuffer | Uint8Array,
): Promise<void> {
  await env.R2.put(r2FileKey(id), body, {
    httpMetadata: { contentType: "application/json" },
  });
}

// ─── Shared PUT pipeline (used by owner + share-token writes) ──────
//
// Owner endpoint and the two share-token write paths (file share write,
// folder-share child write) all run the same body-validate + R2 write +
// version bump + JSON response, so the implementation lives in one
// place. `row` must already be loaded; the caller is responsible for
// authorization (owner check, share-token resolution, etc.).
export async function putFileBlob(env: Env, row: FileRow, req: Request): Promise<Response> {
  // Optimistic concurrency: if the client supplies If-Match and it
  // doesn't match the current version, refuse and return the current
  // metadata so the client can decide what to do.
  const ifMatch = req.headers.get("if-match");
  if (ifMatch !== null) {
    const wanted = ifMatch.replace(/^"|"$/g, "");
    if (wanted !== String(row.version)) {
      const tags = await tagsRepo.listForEntity(env, "file", row.id);
      return jsonResponse(
        { error: "version mismatch", current: rowToMeta(row, tags) },
        { status: 409 },
      );
    }
  }

  const buf = await req.arrayBuffer();
  if (buf.byteLength === 0) return errorResponse(400, "empty body");
  if (buf.byteLength > MAX_FILE_BYTES) return errorResponse(413, "file too large");

  let parsed: FileBlob;
  try {
    parsed = JSON.parse(new TextDecoder().decode(buf));
  } catch {
    return errorResponse(400, "invalid JSON");
  }
  const validationError = validateBlobForKind(row.kind, parsed);
  if (validationError) return errorResponse(400, validationError);

  await writeR2Blob(env, row.id, buf);

  const ts = now();
  const nextVersion = row.version + 1;
  await filesRepo.updateMeta(env, row.owner, row.id, {
    version: nextVersion,
    size_bytes: buf.byteLength,
    updated_at: ts,
  });

  const tags = await tagsRepo.listForEntity(env, "file", row.id);
  const shareMap = await sharesRepo.countActiveByTarget(env, row.owner, "file", [row.id]);
  return jsonResponse({
    id: row.id,
    folderId: row.folder_id ?? null,
    name: row.name,
    kind: row.kind,
    tags,
    version: nextVersion,
    sizeBytes: buf.byteLength,
    hasThumb: row.has_thumb,
    thumbUpdatedAt: row.thumb_updated_at,
    activeShareCount: shareMap.get(row.id) ?? 0,
    createdAt: row.created_at,
    updatedAt: ts,
  } satisfies FileMeta);
}

// Create a new file inside an explicit folder. Used by folder-share
// write endpoints (the share's `owner` is the file's `owner`).
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
  await writeR2Blob(env, id, seedBytes);
  await filesRepo.insert(env, {
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
  });
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

// ─── Rename: mirror new name into excalidraw appState ───────────────
//
// On rename, mirror the new name into the blob's `appState.name` so the
// R2-backed blob and the D1 row don't drift. This keeps Excalidraw's
// export-dialog filename and any downloaded `.excalidraw` consistent
// with the dashboard label until the next autosave reconciles them.
//
// Best-effort: a missing or unparseable blob is left alone (the D1 row
// remains canonical). Drawio blobs are intentionally left untouched —
// see the long comment in worker/routes/files.ts.
export async function mirrorRenameIntoExcalidrawBlob(
  env: Env,
  row: FileRow,
  nextName: string,
): Promise<void> {
  if (row.kind !== "excalidraw") return;
  const obj = await env.R2.get(r2FileKey(row.id));
  if (!obj) return;
  let parsed: FileBlob | null = null;
  try {
    parsed = JSON.parse(await obj.text()) as FileBlob;
  } catch {
    parsed = null;
  }
  if (!parsed) return;
  const excalidraw = parsed as ExcalidrawFileBlob;
  const nextBlob: FileBlob = {
    ...excalidraw,
    appState: { ...(excalidraw.appState ?? {}), name: nextName },
  };
  await env.R2.put(r2FileKey(row.id), JSON.stringify(nextBlob), {
    httpMetadata: { contentType: "application/json" },
  });
}
