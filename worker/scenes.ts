// Scene CRUD handlers. The full scene blob (elements + appState + files)
// lives in R2; D1 holds only the metadata index.
//
// R2 layout:
//   scenes/{id}.json   -- the scene blob
//   thumbs/{id}.svg    -- optional SVG thumbnail
//
// Ownership is tracked in D1 (`scenes.owner` → `users.id`); R2 paths are
// flat by id so future ownership changes are metadata-only.
//
// Versioning: every successful PUT bumps `version` in D1. Clients should
// send `If-Match: <version>`; mismatch returns 409 with the current row so
// the client can decide whether to retry or surface the conflict.

import { and, desc, eq } from "drizzle-orm";
import type { Env, SceneBlob, SceneMeta, SceneRow } from "./types";
import { rowToMeta } from "./types";
import { getDb, t } from "./db/client";
import { errorResponse, jsonResponse, newId, now } from "./util";
import {
  descendantFolderIds,
  ensureInbox,
  loadScenesInFolders,
} from "./folders";
import {
  collectTagsForMany,
  listTagsFor,
  replaceTagsFor,
} from "./tags";

const MAX_SCENE_BYTES = 25 * 1024 * 1024; // 25 MB; embedded images live in `files`
const MAX_THUMB_BYTES = 1 * 1024 * 1024; // 1 MB SVG ceiling

function r2SceneKey(id: string) {
  return `scenes/${id}.json`;
}
function r2ThumbKey(id: string) {
  return `thumbs/${id}.svg`;
}

// ─── List ─────────────────────────────────────────────────────────────
// Supports query params:
//   folderId=<id>|inbox          — filter to direct children of one folder
//   recursive=1                  — combine with folderId for whole subtree
//   tag=<name> (repeatable)      — AND-intersection by tag names
//   q=<text>                     — case-insensitive name LIKE match
export async function listScenes(req: Request, env: Env, owner: string): Promise<Response> {
  const inbox = await ensureInbox(env, owner);
  const url = new URL(req.url);
  const params = url.searchParams;

  const folderParam = params.get("folderId");
  const recursive = params.get("recursive") === "1";
  const tagFilters = params.getAll("tag").map((t) => t.trim().toLowerCase()).filter(Boolean);
  const q = (params.get("q") || "").trim();

  const db = getDb(env);
  let rows: SceneRow[];

  if (folderParam) {
    const folderId = folderParam === "inbox" ? inbox.id : folderParam;
    if (recursive) {
      const ids = await descendantFolderIds(env, owner, folderId);
      rows = await loadScenesInFolders(env, owner, ids);
    } else {
      rows = await db
        .select()
        .from(t.scenes)
        .where(and(eq(t.scenes.owner, owner), eq(t.scenes.folder_id, folderId)))
        .orderBy(desc(t.scenes.updated_at))
        .limit(1000)
        .all();
    }
  } else {
    rows = await db
      .select()
      .from(t.scenes)
      .where(eq(t.scenes.owner, owner))
      .orderBy(desc(t.scenes.updated_at))
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
    "scene",
    rows.map((r) => r.id)
  );

  // AND-filter by tags (intersection).
  if (tagFilters.length > 0) {
    rows = rows.filter((r) => {
      const t = tagMap.get(r.id) ?? [];
      return tagFilters.every((needle) => t.includes(needle));
    });
  }

  const out: SceneMeta[] = rows.map((r) => rowToMeta(r, tagMap.get(r.id) ?? []));
  return jsonResponse({ scenes: out });
}

// ─── Create ───────────────────────────────────────────────────────────
export async function createScene(req: Request, env: Env, owner: string): Promise<Response> {
  let body: { name?: string; folderId?: string; tags?: string[] } = {};
  try {
    body = (await req.json()) as typeof body;
  } catch {
    /* ignore — empty body is fine */
  }
  const inbox = await ensureInbox(env, owner);
  const db = getDb(env);
  const folderId = body.folderId || inbox.id;
  if (folderId !== inbox.id) {
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

  // Seed an empty scene so subsequent GETs return something predictable.
  const seed: SceneBlob = { elements: [], appState: { name }, files: {} };
  const seedBytes = new TextEncoder().encode(JSON.stringify(seed));
  await env.R2.put(r2SceneKey(id), seedBytes, {
    httpMetadata: { contentType: "application/json" },
  });

  await db
    .insert(t.scenes)
    .values({
      id,
      owner,
      folder_id: folderId,
      name,
      version: 1,
      size_bytes: seedBytes.byteLength,
      has_thumb: false,
      created_at: ts,
      updated_at: ts,
    })
    .run();

  const tags = Array.isArray(body.tags)
    ? await replaceTagsFor(env, owner, "scene", id, body.tags)
    : [];

  const meta: SceneMeta = {
    id,
    folderId,
    name,
    tags,
    version: 1,
    sizeBytes: seedBytes.byteLength,
    hasThumb: false,
    createdAt: ts,
    updatedAt: ts,
  };
  return jsonResponse(meta);
}

// ─── Read ─────────────────────────────────────────────────────────────
async function loadRow(env: Env, owner: string, id: string): Promise<SceneRow | null> {
  const db = getDb(env);
  const row = await db
    .select()
    .from(t.scenes)
    .where(and(eq(t.scenes.id, id), eq(t.scenes.owner, owner)))
    .get();
  return row ?? null;
}

// Used by /api/share/:token too; doesn't filter by owner.
export async function loadRowAnyOwner(env: Env, id: string): Promise<SceneRow | null> {
  const db = getDb(env);
  const row = await db.select().from(t.scenes).where(eq(t.scenes.id, id)).get();
  return row ?? null;
}

export async function getScene(env: Env, owner: string, id: string): Promise<Response> {
  const row = await loadRow(env, owner, id);
  if (!row) return errorResponse(404, "scene not found");
  return await streamSceneBody(env, row);
}

export async function streamSceneBody(
  env: Env,
  row: SceneRow,
  opts: { download?: boolean } = {}
): Promise<Response> {
  const obj = await env.R2.get(r2SceneKey(row.id));
  if (!obj) return errorResponse(404, "scene blob missing in R2");
  const headers: Record<string, string> = {
    "content-type": "application/json; charset=utf-8",
    etag: `"${row.version}"`,
    "x-scene-id": row.id,
    "x-scene-name": encodeURIComponent(row.name),
    "x-scene-version": String(row.version),
    "x-scene-updated-at": String(row.updated_at),
    "cache-control": "no-store",
  };
  if (opts.download) {
    headers["content-disposition"] = `attachment; filename="${safeFilename(row.name)}.excalidraw"`;
  }
  return new Response(obj.body, { headers });
}

function safeFilename(name: string): string {
  // Strip path-unsafe characters; keep it ASCII-friendly.
  const base = name.replace(/[\\/:*?"<>|\x00-\x1F]/g, "_").trim() || "scene";
  return base.slice(0, 80);
}

export async function downloadScene(env: Env, owner: string, id: string): Promise<Response> {
  const row = await loadRow(env, owner, id);
  if (!row) return errorResponse(404, "scene not found");
  return await streamSceneBody(env, row, { download: true });
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
      const tags = await listTagsFor(env, "scene", id);
      return jsonResponse(
        { error: "version mismatch", current: rowToMeta(row, tags) },
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

  await env.R2.put(r2SceneKey(id), buf, {
    httpMetadata: { contentType: "application/json" },
  });

  const ts = now();
  const nextVersion = row.version + 1;
  const db = getDb(env);
  await db
    .update(t.scenes)
    .set({
      name: nextName,
      version: nextVersion,
      size_bytes: buf.byteLength,
      updated_at: ts,
    })
    .where(and(eq(t.scenes.id, id), eq(t.scenes.owner, owner)))
    .run();

  const tags = await listTagsFor(env, "scene", id);
  return jsonResponse({
    id,
    folderId: row.folder_id ?? "",
    name: nextName,
    tags,
    version: nextVersion,
    sizeBytes: buf.byteLength,
    hasThumb: row.has_thumb,
    createdAt: row.created_at,
    updatedAt: ts,
  } satisfies SceneMeta);
}

// ─── Patch (rename / move / retag) ────────────────────────────────────
export async function patchScene(req: Request, env: Env, owner: string, id: string): Promise<Response> {
  const row = await loadRow(env, owner, id);
  if (!row) return errorResponse(404, "scene not found");

  let body: { name?: string; folderId?: string; tags?: string[] };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return errorResponse(400, "invalid JSON");
  }

  let nextName = row.name;
  let nextFolder = row.folder_id;

  if (body.name !== undefined) {
    const trimmed = body.name.trim().slice(0, 200);
    if (!trimmed) return errorResponse(400, "name required");
    nextName = trimmed;
  }
  const db = getDb(env);
  if (body.folderId !== undefined && body.folderId !== row.folder_id) {
    const folder = await db
      .select({ id: t.folders.id })
      .from(t.folders)
      .where(and(eq(t.folders.id, body.folderId), eq(t.folders.owner, owner)))
      .get();
    if (!folder) return errorResponse(404, "folder not found");
    nextFolder = body.folderId;
  }

  const ts = now();
  await db
    .update(t.scenes)
    .set({ name: nextName, folder_id: nextFolder, updated_at: ts })
    .where(and(eq(t.scenes.id, id), eq(t.scenes.owner, owner)))
    .run();

  const tags = Array.isArray(body.tags)
    ? await replaceTagsFor(env, owner, "scene", id, body.tags)
    : await listTagsFor(env, "scene", id);

  return jsonResponse(
    rowToMeta({ ...row, name: nextName, folder_id: nextFolder, updated_at: ts }, tags)
  );
}

// PUT /api/scenes/:id/tags  — replace the tag set.
export async function putSceneTags(
  req: Request,
  env: Env,
  owner: string,
  id: string
): Promise<Response> {
  const row = await loadRow(env, owner, id);
  if (!row) return errorResponse(404, "scene not found");
  let body: { tags?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return errorResponse(400, "invalid JSON");
  }
  const tags = await replaceTagsFor(env, owner, "scene", id, body.tags);
  // Bump updated_at so the dashboard re-renders the card.
  const ts = now();
  const db = getDb(env);
  await db
    .update(t.scenes)
    .set({ updated_at: ts })
    .where(and(eq(t.scenes.id, id), eq(t.scenes.owner, owner)))
    .run();
  return jsonResponse({ id, tags, updatedAt: ts });
}

// ─── Delete ───────────────────────────────────────────────────────────
export async function deleteScene(env: Env, owner: string, id: string): Promise<Response> {
  const row = await loadRow(env, owner, id);
  if (!row) return errorResponse(404, "scene not found");
  // Cascade explicitly: shares + taggings (D1 doesn't enforce FKs by default).
  const db = getDb(env);
  await db.batch([
    db
      .delete(t.shares)
      .where(and(eq(t.shares.target_type, "scene"), eq(t.shares.target_id, id))),
    db
      .delete(t.taggings)
      .where(
        and(eq(t.taggings.target_type, "scene"), eq(t.taggings.target_id, id))
      ),
    db
      .delete(t.scenes)
      .where(and(eq(t.scenes.id, id), eq(t.scenes.owner, owner))),
  ]);
  // Best-effort R2 cleanup; swallow errors so a partial state still resolves.
  await Promise.allSettled([env.R2.delete(r2SceneKey(id)), env.R2.delete(r2ThumbKey(id))]);
  return jsonResponse({ ok: true });
}

// ─── Thumbnails ───────────────────────────────────────────────────────
export async function putThumb(req: Request, env: Env, owner: string, id: string): Promise<Response> {
  const row = await loadRow(env, owner, id);
  if (!row) return errorResponse(404, "scene not found");

  const buf = await req.arrayBuffer();
  if (buf.byteLength === 0) return errorResponse(400, "empty body");
  if (buf.byteLength > MAX_THUMB_BYTES) return errorResponse(413, "thumbnail too large");

  await env.R2.put(r2ThumbKey(id), buf, {
    httpMetadata: { contentType: "image/svg+xml" },
  });
  if (!row.has_thumb) {
    const db = getDb(env);
    await db
      .update(t.scenes)
      .set({ has_thumb: true })
      .where(and(eq(t.scenes.id, id), eq(t.scenes.owner, owner)))
      .run();
  }
  return jsonResponse({ ok: true });
}

export async function getThumb(env: Env, _owner: string, id: string): Promise<Response> {
  const obj = await env.R2.get(r2ThumbKey(id));
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
export function thumbKey(id: string) {
  return r2ThumbKey(id);
}

// Exposed for the admin user-delete cascade.
export function sceneKey(id: string) {
  return r2SceneKey(id);
}

// Exposed for share.ts so it can hydrate tags consistently.
export { listTagsFor };

// Helper used by share.ts when creating a scene inside a folder share.
export async function createSceneInFolder(
  env: Env,
  owner: string,
  folderId: string,
  name: string
): Promise<SceneMeta> {
  const id = newId();
  const ts = now();
  const safe = (name || "Untitled").slice(0, 200);
  const seed: SceneBlob = { elements: [], appState: { name: safe }, files: {} };
  const seedBytes = new TextEncoder().encode(JSON.stringify(seed));
  await env.R2.put(r2SceneKey(id), seedBytes, {
    httpMetadata: { contentType: "application/json" },
  });
  const db = getDb(env);
  await db
    .insert(t.scenes)
    .values({
      id,
      owner,
      folder_id: folderId,
      name: safe,
      version: 1,
      size_bytes: seedBytes.byteLength,
      has_thumb: false,
      created_at: ts,
      updated_at: ts,
    })
    .run();
  return {
    id,
    folderId,
    name: safe,
    tags: [],
    version: 1,
    sizeBytes: seedBytes.byteLength,
    hasThumb: false,
    createdAt: ts,
    updatedAt: ts,
  };
}
