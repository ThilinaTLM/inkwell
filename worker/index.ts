// Inkwell — Cloudflare Worker entry point.
//
// Routes are matched by hand (no router framework) because the API surface is
// small and the bundle stays leaner without one. Anything not matching /api/*
// is handed off to the static assets binding (the built React SPA).

import type { Env } from "./types";
import { jsonResponse, errorResponse } from "./util";
import {
  checkPassword,
  clearSessionCookie,
  createSessionCookie,
  validateSession,
} from "./auth";
import {
  createScene,
  deleteScene,
  getScene,
  getThumb,
  listScenes,
  patchScene,
  putScene,
  putThumb,
} from "./scenes";
import {
  createShareToken,
  getThumbViaShareToken,
  getViaShareToken,
  listShareTokens,
  putViaShareToken,
  revokeShareToken,
} from "./share";

export default {
  async fetch(req: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    const url = new URL(req.url);
    const path = url.pathname;

    // CORS preflight (only relevant if you front this with a different origin;
    // same-origin SPA usage doesn't need it).
    if (req.method === "OPTIONS" && path.startsWith("/api/")) {
      return handleCorsPreflight(req, env);
    }

    if (path.startsWith("/api/")) {
      const resp = await handleApi(req, env, path);
      return withCors(resp, req, env);
    }

    // Everything else — serve the SPA.
    return env.ASSETS.fetch(req);
  },
};

async function handleApi(req: Request, env: Env, path: string): Promise<Response> {
  // Public endpoints (no session required).
  if (path === "/api/auth/login" && req.method === "POST") {
    return handleLogin(req, env);
  }
  if (path === "/api/auth/logout" && req.method === "POST") {
    return new Response(null, {
      status: 204,
      headers: { "set-cookie": clearSessionCookie() },
    });
  }

  // Share-token endpoints — no session required, token is the credential.
  const shareMatch = path.match(/^\/api\/share\/([A-Za-z0-9_-]{16,})$/);
  if (shareMatch) {
    const token = shareMatch[1];
    if (req.method === "GET") return getViaShareToken(env, token);
    if (req.method === "PUT") return putViaShareToken(req, env, token);
    return errorResponse(405, "method not allowed");
  }
  const shareThumbMatch = path.match(/^\/api\/share\/([A-Za-z0-9_-]{16,})\/thumb$/);
  if (shareThumbMatch && req.method === "GET") {
    return getThumbViaShareToken(env, shareThumbMatch[1]);
  }

  // Everything below requires a valid session cookie.
  const session = await validateSession(req, env);
  if (!session) return errorResponse(401, "not authenticated");
  const owner = session.owner;

  if (path === "/api/me" && req.method === "GET") {
    return jsonResponse({ owner, expiresAt: session.expiresAt });
  }

  if (path === "/api/scenes") {
    if (req.method === "GET") return listScenes(env, owner);
    if (req.method === "POST") return createScene(req, env, owner);
    return errorResponse(405, "method not allowed");
  }

  // /api/scenes/:id and sub-paths.
  const sceneMatch = path.match(/^\/api\/scenes\/([a-z0-9]{8,32})(\/[^/]+)?$/);
  if (sceneMatch) {
    const id = sceneMatch[1];
    const sub = sceneMatch[2];

    if (!sub) {
      if (req.method === "GET") return getScene(env, owner, id);
      if (req.method === "PUT") return putScene(req, env, owner, id);
      if (req.method === "PATCH") return patchScene(req, env, owner, id);
      if (req.method === "DELETE") return deleteScene(env, owner, id);
      return errorResponse(405, "method not allowed");
    }
    if (sub === "/thumb") {
      if (req.method === "GET") return getThumb(env, owner, id);
      if (req.method === "PUT") return putThumb(req, env, owner, id);
      return errorResponse(405, "method not allowed");
    }
    if (sub === "/shares") {
      if (req.method === "GET") return listShareTokens(env, owner, id);
      if (req.method === "POST") return createShareToken(req, env, owner, id);
      return errorResponse(405, "method not allowed");
    }
  }

  // /api/scenes/:id/shares/:token  (revoke)
  const shareRevokeMatch = path.match(
    /^\/api\/scenes\/([a-z0-9]{8,32})\/shares\/([A-Za-z0-9_-]{16,})$/
  );
  if (shareRevokeMatch && req.method === "DELETE") {
    return revokeShareToken(env, owner, shareRevokeMatch[1], shareRevokeMatch[2]);
  }

  return errorResponse(404, "not found");
}

async function handleLogin(req: Request, env: Env): Promise<Response> {
  let body: { password?: string };
  try {
    body = (await req.json()) as { password?: string };
  } catch {
    return errorResponse(400, "invalid JSON");
  }
  if (!body.password) return errorResponse(400, "password required");
  const ok = await checkPassword(env, body.password);
  if (!ok) return errorResponse(401, "wrong password");
  const cookie = await createSessionCookie(env);
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "set-cookie": cookie,
    },
  });
}

// ─── CORS ─────────────────────────────────────────────────────────────
// Only matters if you serve the SPA from a different origin (e.g. running
// `vite dev` against a deployed Worker). Vite's dev proxy hides this in the
// normal local workflow.
function corsOrigin(req: Request, env: Env): string | null {
  const origin = req.headers.get("origin");
  if (!origin) return null;
  const allowed = (env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (allowed.length === 0) return null;
  return allowed.includes(origin) ? origin : null;
}

function handleCorsPreflight(req: Request, env: Env): Response {
  const origin = corsOrigin(req, env);
  if (!origin) return new Response(null, { status: 204 });
  return new Response(null, {
    status: 204,
    headers: {
      "access-control-allow-origin": origin,
      "access-control-allow-credentials": "true",
      "access-control-allow-methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
      "access-control-allow-headers": "content-type, if-match",
      "access-control-max-age": "86400",
    },
  });
}

function withCors(resp: Response, req: Request, env: Env): Response {
  const origin = corsOrigin(req, env);
  if (!origin) return resp;
  const headers = new Headers(resp.headers);
  headers.set("access-control-allow-origin", origin);
  headers.set("access-control-allow-credentials", "true");
  headers.append("vary", "origin");
  return new Response(resp.body, { status: resp.status, headers });
}
