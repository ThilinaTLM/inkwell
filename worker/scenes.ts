// Scene CRUD handlers. The full scene blob (elements + appState + files)
// lives in R2; D1 holds only the metadata index.
//
// R2 layout:
//   scenes/{owner}/{id}.json   -- the scene blob
//   thumbs/{owner}/{id}.svg    -- optional SVG thumbnail
//
// Versioning: every successful PUT bumps `version` in D1. Clients should
// send `If-Match: <version>`; mismatch returns 409 with the current row so
// the client can decide whether to retry or surface the conflict.

import type { Env, SceneBlob, SceneRow } from "./types";
import { rowToMeta } from "./types";
import { errorResponse, jsonResponse, newId, now } from "./util";

const MAX_SCENE_BYTES = 25 * 1024 * 1024; // 25 MB; embedded images live in `files`
const MAX_THUMB_BYTES = 1 * 1024 * 1024; // 1 MB SVG ceiling

function r2SceneKey(owner: string, id: string) {
  return `scenes/${owner}/${id}.json`;
}
function r2ThumbKey(owner: string, id: string) {
  return `thumbs/${owner}/${id}.svg`;
}

// ─── List ─────────────────────────────────────────────────────────────
export async function listScenes(env: Env, owner: string): Promise<Response> {
  const { results } = await env.DB.prepare(
    `SELECT id, owner, name, version, size_bytes, has_thumb, created_at, updated_at
     FROM scenes WHERE owner = ?
     ORDER BY updated_at DESC LIMIT 500`
  )
    .bind(owner)
    .all<SceneRow>();
  return jsonResponse({ scenes: (results || []).map(rowToMeta) });
}

// ─── Create ───────────────────────────────────────────────────────────
export async function createScene(req: Request, env: Env, owner: string): Promise<Response> {
  let body: { name?: string } = {};
  try {
    body = (await req.json()) as { name?: string };
  } catch {
    /* ignore — empty body is fine */
  }
  const id = newId();
  const t = now();
  const name = (body.name || "Untitled").slice(0, 200);

  // Seed an empty scene so subsequent GETs return something predictable.
  const seed: SceneBlob = { elements: [], appState: { name }, files: {} };
  const seedBytes = new TextEncoder().encode(JSON.stringify(seed));
  await env.R2.put(r2SceneKey(owner, id), seedBytes, {
    httpMetadata: { contentType: "application/json" },
  });

  await env.DB.prepare(
    `INSERT INTO scenes (id, owner, name, version, size_bytes, has_thumb, created_at, updated_at)
     VALUES (?, ?, ?, 1, ?, 0, ?, ?)`
  )
    .bind(id, owner, name, seedBytes.byteLength, t, t)
    .run();

  return jsonResponse({
    id,
    name,
    version: 1,
    sizeBytes: seedBytes.byteLength,
    hasThumb: false,
    createdAt: t,
    updatedAt: t,
  });
}

// ─── Read ─────────────────────────────────────────────────────────────
async function loadRow(env: Env, owner: string, id: string): Promise<SceneRow | null> {
  return await env.DB.prepare(
    `SELECT id, owner, name, version, size_bytes, has_thumb, created_at, updated_at
     FROM scenes WHERE id = ? AND owner = ?`
  )
    .bind(id, owner)
    .first<SceneRow>();
}

// Used by /api/share/:token too; doesn't filter by owner.
export async function loadRowAnyOwner(env: Env, id: string): Promise<SceneRow | null> {
  return await env.DB.prepare(
    `SELECT id, owner, name, version, size_bytes, has_thumb, created_at, updated_at
     FROM scenes WHERE id = ?`
  )
    .bind(id)
    .first<SceneRow>();
}

export async function getScene(env: Env, owner: string, id: string): Promise<Response> {
  const row = await loadRow(env, owner, id);
  if (!row) return errorResponse(404, "scene not found");
  return await streamSceneBody(env, row);
}

export async function streamSceneBody(env: Env, row: SceneRow): Promise<Response> {
  const obj = await env.R2.get(r2SceneKey(row.owner, row.id));
  if (!obj) return errorResponse(404, "scene blob missing in R2");
  return new Response(obj.body, {
    headers: {
      "content-type": "application/json; charset=utf-8",
      etag: `"${row.version}"`,
      "x-scene-id": row.id,
      "x-scene-name": encodeURIComponent(row.name),
      "x-scene-version": String(row.version),
      "x-scene-updated-at": String(row.updated_at),
      "cache-control": "no-store",
    },
  });
}

// ─── Update (full body) ───────────────────────────────────────────────
export async function putScene(req: Request, env: Env, owner: string, id: string): Promise<Response> {
  const row = await loadRow(env, owner, id);
  if (!row) return errorResponse(404, "scene not found");

  // Optimistic concurrency: if the client supplies If-Match and it doesn't
  // match the current version, refuse and return the current metadata so
  // the client can decide what to do.
  const ifMatch = req.headers.get("if-match");
  if (ifMatch !== null) {
    const wanted = ifMatch.replace(/^"|"$/g, "");
    if (wanted !== String(row.version)) {
      return jsonResponse(
        { error: "version mismatch", current: rowToMeta(row) },
        { status: 409 }
      );
    }
  }

  const buf = await req.arrayBuffer();
  if (buf.byteLength === 0) return errorResponse(400, "empty body");
  if (buf.byteLength > MAX_SCENE_BYTES) return errorResponse(413, "scene too large");

  // Light JSON validation — we store as bytes either way, but bad JSON
  // would corrupt subsequent GETs.
  let parsed: SceneBlob;
  try {
    parsed = JSON.parse(new TextDecoder().decode(buf));
  } catch {
    return errorResponse(400, "invalid JSON");
  }
  if (!Array.isArray(parsed.elements)) return errorResponse(400, "elements must be an array");

  // Allow appState.name to drive the canonical scene name.
  const nextName =
    (typeof parsed.appState?.name === "string" && parsed.appState.name.slice(0, 200)) || row.name;

  await env.R2.put(r2SceneKey(owner, id), buf, {
    httpMetadata: { contentType: "application/json" },
  });

  const t = now();
  const nextVersion = row.version + 1;
  await env.DB.prepare(
    `UPDATE scenes
     SET name = ?, version = ?, size_bytes = ?, updated_at = ?
     WHERE id = ? AND owner = ?`
  )
    .bind(nextName, nextVersion, buf.byteLength, t, id, owner)
    .run();

  return jsonResponse({
    id,
    name: nextName,
    version: nextVersion,
    sizeBytes: buf.byteLength,
    hasThumb: !!row.has_thumb,
    createdAt: row.created_at,
    updatedAt: t,
  });
}

// ─── Patch (rename) ───────────────────────────────────────────────────
export async function patchScene(req: Request, env: Env, owner: string, id: string): Promise<Response> {
  const row = await loadRow(env, owner, id);
  if (!row) return errorResponse(404, "scene not found");

  let body: { name?: string };
  try {
    body = (await req.json()) as { name?: string };
  } catch {
    return errorResponse(400, "invalid JSON");
  }
  if (!body.name) return errorResponse(400, "name required");
  const name = body.name.slice(0, 200);
  const t = now();
  await env.DB.prepare(`UPDATE scenes SET name = ?, updated_at = ? WHERE id = ? AND owner = ?`)
    .bind(name, t, id, owner)
    .run();
  return jsonResponse({ ...rowToMeta(row), name, updatedAt: t });
}

// ─── Delete ───────────────────────────────────────────────────────────
export async function deleteScene(env: Env, owner: string, id: string): Promise<Response> {
  const row = await loadRow(env, owner, id);
  if (!row) return errorResponse(404, "scene not found");
  // ON DELETE CASCADE in schema cleans up share_tokens.
  await env.DB.prepare(`DELETE FROM scenes WHERE id = ? AND owner = ?`).bind(id, owner).run();
  // Best-effort R2 cleanup; swallow errors so a partial state still resolves.
  await Promise.allSettled([
    env.R2.delete(r2SceneKey(owner, id)),
    env.R2.delete(r2ThumbKey(owner, id)),
  ]);
  return jsonResponse({ ok: true });
}

// ─── Thumbnails ───────────────────────────────────────────────────────
export async function putThumb(req: Request, env: Env, owner: string, id: string): Promise<Response> {
  const row = await loadRow(env, owner, id);
  if (!row) return errorResponse(404, "scene not found");

  const buf = await req.arrayBuffer();
  if (buf.byteLength === 0) return errorResponse(400, "empty body");
  if (buf.byteLength > MAX_THUMB_BYTES) return errorResponse(413, "thumbnail too large");

  await env.R2.put(r2ThumbKey(owner, id), buf, {
    httpMetadata: { contentType: "image/svg+xml" },
  });
  if (!row.has_thumb) {
    await env.DB.prepare(`UPDATE scenes SET has_thumb = 1 WHERE id = ? AND owner = ?`)
      .bind(id, owner)
      .run();
  }
  return jsonResponse({ ok: true });
}

export async function getThumb(env: Env, owner: string, id: string): Promise<Response> {
  const obj = await env.R2.get(r2ThumbKey(owner, id));
  if (!obj) return errorResponse(404, "no thumbnail");
  return new Response(obj.body, {
    headers: {
      "content-type": "image/svg+xml; charset=utf-8",
      "cache-control": "private, max-age=60",
    },
  });
}

// Exposed for share.ts so a token-authenticated request can read the same
// thumbnail without re-implementing the R2 fetch.
export function thumbKey(owner: string, id: string) {
  return r2ThumbKey(owner, id);
}
