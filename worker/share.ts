// Share tokens.
//
// A token is a random URL-safe string mapped to a scene id and a permission
// ('read' | 'write'). Tokens are independent of the session cookie — anyone
// holding the token can act on the linked scene at the granted permission.

import type { Env, SharePermission, ShareTokenRow } from "./types";
import { errorResponse, jsonResponse, newToken, now } from "./util";
import { loadRowAnyOwner, streamSceneBody, putScene, thumbKey } from "./scenes";

export async function createShareToken(
  req: Request,
  env: Env,
  owner: string,
  sceneId: string
): Promise<Response> {
  const row = await env.DB.prepare(`SELECT id FROM scenes WHERE id = ? AND owner = ?`)
    .bind(sceneId, owner)
    .first<{ id: string }>();
  if (!row) return errorResponse(404, "scene not found");

  let body: { permission?: SharePermission; expiresAt?: number | null } = {};
  try {
    body = (await req.json()) as typeof body;
  } catch {
    /* empty body — defaults are fine */
  }
  const permission: SharePermission = body.permission === "write" ? "write" : "read";
  const expiresAt = body.expiresAt && Number.isFinite(body.expiresAt) ? Number(body.expiresAt) : null;

  const token = newToken();
  await env.DB.prepare(
    `INSERT INTO share_tokens (token, scene_id, permission, created_at, expires_at)
     VALUES (?, ?, ?, ?, ?)`
  )
    .bind(token, sceneId, permission, now(), expiresAt)
    .run();

  return jsonResponse({ token, permission, expiresAt });
}

export async function listShareTokens(env: Env, owner: string, sceneId: string): Promise<Response> {
  // Only scene owner can enumerate tokens.
  const row = await env.DB.prepare(`SELECT id FROM scenes WHERE id = ? AND owner = ?`)
    .bind(sceneId, owner)
    .first<{ id: string }>();
  if (!row) return errorResponse(404, "scene not found");

  const { results } = await env.DB.prepare(
    `SELECT token, scene_id, permission, created_at, expires_at
     FROM share_tokens WHERE scene_id = ? ORDER BY created_at DESC`
  )
    .bind(sceneId)
    .all<ShareTokenRow>();

  return jsonResponse({
    tokens: (results || []).map((r) => ({
      token: r.token,
      permission: r.permission,
      createdAt: r.created_at,
      expiresAt: r.expires_at,
    })),
  });
}

export async function revokeShareToken(
  env: Env,
  owner: string,
  sceneId: string,
  token: string
): Promise<Response> {
  const row = await env.DB.prepare(`SELECT id FROM scenes WHERE id = ? AND owner = ?`)
    .bind(sceneId, owner)
    .first<{ id: string }>();
  if (!row) return errorResponse(404, "scene not found");
  await env.DB.prepare(`DELETE FROM share_tokens WHERE token = ? AND scene_id = ?`)
    .bind(token, sceneId)
    .run();
  return jsonResponse({ ok: true });
}

async function resolveToken(env: Env, token: string): Promise<ShareTokenRow | null> {
  const row = await env.DB.prepare(
    `SELECT token, scene_id, permission, created_at, expires_at
     FROM share_tokens WHERE token = ?`
  )
    .bind(token)
    .first<ShareTokenRow>();
  if (!row) return null;
  if (row.expires_at && row.expires_at < Date.now()) return null;
  return row;
}

// GET /api/share/:token — returns the scene blob, plus permission/name in
// headers so the SPA knows whether to render in view-mode.
export async function getViaShareToken(env: Env, token: string): Promise<Response> {
  const tk = await resolveToken(env, token);
  if (!tk) return errorResponse(404, "invalid or expired token");
  const scene = await loadRowAnyOwner(env, tk.scene_id);
  if (!scene) return errorResponse(404, "scene not found");
  const resp = await streamSceneBody(env, scene);
  // Append the permission so the SPA can decide read-only vs editable.
  const merged = new Headers(resp.headers);
  merged.set("x-share-permission", tk.permission);
  return new Response(resp.body, { status: resp.status, headers: merged });
}

// PUT /api/share/:token — write through if the token has 'write' permission.
export async function putViaShareToken(req: Request, env: Env, token: string): Promise<Response> {
  const tk = await resolveToken(env, token);
  if (!tk) return errorResponse(404, "invalid or expired token");
  if (tk.permission !== "write") return errorResponse(403, "read-only token");
  const scene = await loadRowAnyOwner(env, tk.scene_id);
  if (!scene) return errorResponse(404, "scene not found");
  return await putScene(req, env, scene.owner, scene.id);
}

export async function getThumbViaShareToken(env: Env, token: string): Promise<Response> {
  const tk = await resolveToken(env, token);
  if (!tk) return errorResponse(404, "invalid or expired token");
  const scene = await loadRowAnyOwner(env, tk.scene_id);
  if (!scene || !scene.has_thumb) return errorResponse(404, "no thumbnail");
  const obj = await env.R2.get(thumbKey(scene.id));
  if (!obj) return errorResponse(404, "no thumbnail");
  return new Response(obj.body, {
    headers: {
      "content-type": "image/svg+xml; charset=utf-8",
      "cache-control": "private, max-age=60",
    },
  });
}
