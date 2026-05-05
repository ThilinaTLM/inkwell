// Inkwell — Cloudflare Worker entry point.
//
// Routes are matched by hand (no router framework) because the API surface is
// small and the bundle stays leaner without one. Anything not matching /api/*
// is handed off to the static assets binding (the built React SPA).

import {
  changeOwnPassword,
  clearSessionCookie,
  createSessionCookie,
  getUserById,
  loginWithPassword,
  type Session,
  validateSession,
} from "./auth";
import {
  createFile,
  deleteFile,
  downloadFile,
  getFile,
  getThumb,
  listFiles,
  patchFile,
  putFile,
  putFileTags,
  putThumb,
} from "./files";
import { createFolder, deleteFolder, listFolders, patchFolder } from "./folders";
import {
  acceptInvite,
  createInviteAdmin,
  listInvitesAdmin,
  peekInvite,
  revokeInviteAdmin,
} from "./invites";
import {
  createFileShare,
  createFileViaFolderShare,
  createFolderShare,
  deleteFileViaFolderShare,
  downloadFolderShareFile,
  downloadViaShareToken,
  getFolderShareFile,
  getFolderShareFileThumb,
  getThumbViaShareToken,
  getViaShareToken,
  listAllShares,
  listFileShares,
  listFolderShareFolders,
  listFolderShares,
  putFolderShareFile,
  putViaShareToken,
  revokeFileShare,
  revokeFolderShare,
  revokeShareGeneric,
  rotateShareGeneric,
  updateShareGeneric,
} from "./share";
import { deleteTag, listTags, renameTag } from "./tags";
import type { Env } from "./types";
import { deleteUserAdmin, listUsersAdmin, patchUserAdmin } from "./users";
import { errorResponse, jsonResponse } from "./util";

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(req.url);
    const path = url.pathname;

    // CORS preflight (only relevant if you front this with a different origin;
    // same-origin SPA usage doesn't need it).
    if (req.method === "OPTIONS" && path.startsWith("/api/")) {
      return handleCorsPreflight(req, env);
    }

    if (path.startsWith("/api/")) {
      const resp = await handleApi(req, env, ctx, url, path);
      return withCors(resp, req, env);
    }

    // Everything else — serve the SPA.
    return env.ASSETS.fetch(req);
  },
};

const TOKEN_RE = "[A-Za-z0-9_-]{16,}";
const ID_RE = "[a-z0-9]{8,32}";

async function handleApi(
  req: Request,
  env: Env,
  ctx: ExecutionContext,
  url: URL,
  path: string,
): Promise<Response> {
  // ─── Public: auth ─────────────────────────────────────────────────
  if (path === "/api/auth/login" && req.method === "POST") {
    return handleLogin(req, env);
  }
  if (path === "/api/auth/logout" && req.method === "POST") {
    return new Response(null, {
      status: 204,
      headers: { "set-cookie": clearSessionCookie() },
    });
  }

  // ─── Public: invites ──────────────────────────────────────────────
  const inviteMatch = path.match(new RegExp(`^/api/invites/(${TOKEN_RE})$`));
  if (inviteMatch && req.method === "GET") {
    return peekInvite(env, inviteMatch[1]);
  }
  const inviteAcceptMatch = path.match(new RegExp(`^/api/invites/(${TOKEN_RE})/accept$`));
  if (inviteAcceptMatch && req.method === "POST") {
    return acceptInvite(req, env, inviteAcceptMatch[1]);
  }

  // ─── Public: share tokens ─────────────────────────────────────────
  // /api/share/:token/files  (folder-share write: create new file)
  const shareCreateFile = path.match(new RegExp(`^/api/share/(${TOKEN_RE})/files$`));
  if (shareCreateFile && req.method === "POST") {
    return createFileViaFolderShare(req, env, shareCreateFile[1]);
  }
  // /api/share/:token/files/:fileId(/thumb|/download)
  const shareFile = path.match(
    new RegExp(`^/api/share/(${TOKEN_RE})/files/(${ID_RE})(/thumb|/download)?$`),
  );
  if (shareFile) {
    const tk = shareFile[1];
    const fid = shareFile[2];
    const sub = shareFile[3];
    if (sub === "/thumb") {
      if (req.method === "GET") return getFolderShareFileThumb(env, tk, fid, ctx, req);
      return errorResponse(405, "method not allowed");
    }
    if (sub === "/download") {
      if (req.method === "GET") return downloadFolderShareFile(env, tk, fid, ctx);
      return errorResponse(405, "method not allowed");
    }
    if (req.method === "GET") return getFolderShareFile(env, tk, fid, ctx);
    if (req.method === "PUT") return putFolderShareFile(req, env, tk, fid);
    if (req.method === "DELETE") return deleteFileViaFolderShare(env, tk, fid);
    return errorResponse(405, "method not allowed");
  }
  // /api/share/:token/folders  (folder-share folder listing)
  const shareFolders = path.match(new RegExp(`^/api/share/(${TOKEN_RE})/folders$`));
  if (shareFolders && req.method === "GET") {
    return listFolderShareFolders(env, shareFolders[1], ctx);
  }
  // /api/share/:token/thumb (file-share thumbnail)
  const shareThumbMatch = path.match(new RegExp(`^/api/share/(${TOKEN_RE})/thumb$`));
  if (shareThumbMatch && req.method === "GET") {
    return getThumbViaShareToken(env, shareThumbMatch[1], ctx, req);
  }
  // /api/share/:token/download (file-share download)
  const shareDownload = path.match(new RegExp(`^/api/share/(${TOKEN_RE})/download$`));
  if (shareDownload && req.method === "GET") {
    return downloadViaShareToken(env, shareDownload[1], ctx);
  }
  // /api/share/:token (file-share GET/PUT or folder-share listing)
  const shareMatch = path.match(new RegExp(`^/api/share/(${TOKEN_RE})$`));
  if (shareMatch) {
    const token = shareMatch[1];
    if (req.method === "GET") return getViaShareToken(env, token, ctx);
    if (req.method === "PUT") return putViaShareToken(req, env, token);
    return errorResponse(405, "method not allowed");
  }

  // ─── Authenticated below this line ───────────────────────────────
  const session = await validateSession(req, env);
  if (!session) return errorResponse(401, "not authenticated");
  const userId = session.userId;

  if (path === "/api/me") {
    if (req.method === "GET") return handleMe(req, env, session);
    return errorResponse(405, "method not allowed");
  }
  if (path === "/api/me/password" && req.method === "POST") {
    return handleChangePassword(req, env, session);
  }

  // Admin-only endpoints.
  if (path.startsWith("/api/admin/")) {
    if (!session.isAdmin) return errorResponse(403, "forbidden");
    return handleAdmin(req, env, url, path, session);
  }

  // ─── Folders ──────────────────────────────────────────────────────
  if (path === "/api/folders") {
    if (req.method === "GET") return listFolders(env, userId);
    if (req.method === "POST") return createFolder(req, env, userId);
    return errorResponse(405, "method not allowed");
  }
  const folderMatch = path.match(new RegExp(`^/api/folders/(${ID_RE})(/[^/]+)?(/(${TOKEN_RE}))?$`));
  if (folderMatch) {
    const fid = folderMatch[1];
    const sub = folderMatch[2];
    const tk = folderMatch[4];
    if (!sub) {
      if (req.method === "PATCH") return patchFolder(req, env, userId, fid);
      if (req.method === "DELETE") return deleteFolder(env, userId, fid);
      return errorResponse(405, "method not allowed");
    }
    if (sub === "/shares") {
      if (!tk) {
        if (req.method === "GET") return listFolderShares(env, userId, fid);
        if (req.method === "POST") return createFolderShare(req, env, userId, fid);
        return errorResponse(405, "method not allowed");
      }
      if (req.method === "DELETE") return revokeFolderShare(env, userId, fid, tk);
      return errorResponse(405, "method not allowed");
    }
  }

  // ─── Tags ─────────────────────────────────────────────────────────
  if (path === "/api/tags") {
    if (req.method === "GET") return listTags(env, userId);
    return errorResponse(405, "method not allowed");
  }
  const tagMatch = path.match(new RegExp(`^/api/tags/(${ID_RE})$`));
  if (tagMatch) {
    if (req.method === "PATCH") return renameTag(req, env, userId, tagMatch[1]);
    if (req.method === "DELETE") return deleteTag(env, userId, tagMatch[1]);
    return errorResponse(405, "method not allowed");
  }

  // ─── Cross-target shares ──────────────────────────────────────────
  if (path === "/api/shares") {
    if (req.method === "GET") return listAllShares(env, userId);
    return errorResponse(405, "method not allowed");
  }
  const sharesGeneric = path.match(new RegExp(`^/api/shares/(${TOKEN_RE})$`));
  if (sharesGeneric) {
    if (req.method === "DELETE") return revokeShareGeneric(env, userId, sharesGeneric[1]);
    if (req.method === "PATCH") return updateShareGeneric(req, env, userId, sharesGeneric[1]);
    return errorResponse(405, "method not allowed");
  }
  const sharesRotate = path.match(new RegExp(`^/api/shares/(${TOKEN_RE})/rotate$`));
  if (sharesRotate && req.method === "POST") {
    return rotateShareGeneric(env, userId, sharesRotate[1]);
  }

  // ─── Files ────────────────────────────────────────────────────────
  if (path === "/api/files") {
    if (req.method === "GET") return listFiles(req, env, userId);
    if (req.method === "POST") return createFile(req, env, userId);
    return errorResponse(405, "method not allowed");
  }

  const fileMatch = path.match(new RegExp(`^/api/files/(${ID_RE})(/[^/]+)?$`));
  if (fileMatch) {
    const id = fileMatch[1];
    const sub = fileMatch[2];

    if (!sub) {
      if (req.method === "GET") return getFile(env, userId, id);
      if (req.method === "PUT") return putFile(req, env, userId, id);
      if (req.method === "PATCH") return patchFile(req, env, userId, id);
      if (req.method === "DELETE") return deleteFile(env, userId, id);
      return errorResponse(405, "method not allowed");
    }
    if (sub === "/thumb") {
      if (req.method === "GET") return getThumb(req, env, userId, id, ctx);
      if (req.method === "PUT") return putThumb(req, env, userId, id);
      return errorResponse(405, "method not allowed");
    }
    if (sub === "/download") {
      if (req.method === "GET") return downloadFile(env, userId, id);
      return errorResponse(405, "method not allowed");
    }
    if (sub === "/tags") {
      if (req.method === "PUT") return putFileTags(req, env, userId, id);
      return errorResponse(405, "method not allowed");
    }
    if (sub === "/shares") {
      if (req.method === "GET") return listFileShares(env, userId, id);
      if (req.method === "POST") return createFileShare(req, env, userId, id);
      return errorResponse(405, "method not allowed");
    }
  }

  // /api/files/:id/shares/:token  (revoke)
  const shareRevokeMatch = path.match(new RegExp(`^/api/files/(${ID_RE})/shares/(${TOKEN_RE})$`));
  if (shareRevokeMatch && req.method === "DELETE") {
    return revokeFileShare(env, userId, shareRevokeMatch[1], shareRevokeMatch[2]);
  }

  return errorResponse(404, "not found");
}

// ─── Handlers ─────────────────────────────────────────────────────────

async function handleLogin(req: Request, env: Env): Promise<Response> {
  let body: { email?: string; password?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return errorResponse(400, "invalid JSON");
  }
  const email = typeof body.email === "string" ? body.email : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (!email || !password) return errorResponse(400, "email and password required");

  const result = await loginWithPassword(env, email, password);
  if (!result.ok) {
    if (result.reason === "disabled") {
      return errorResponse(403, "account disabled");
    }
    if (result.reason === "misconfigured") {
      return errorResponse(500, "server misconfigured: SUPER_ADMIN_PASSWORD missing");
    }
    return errorResponse(401, "invalid email or password");
  }

  const cookie = await createSessionCookie(env, result.user.id);
  return new Response(
    JSON.stringify({
      id: result.user.id,
      email: result.user.email,
      firstName: result.user.first_name,
      lastName: result.user.last_name,
      isAdmin: result.user.is_admin,
    }),
    {
      status: 200,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "set-cookie": cookie,
      },
    },
  );
}

async function handleMe(_req: Request, env: Env, session: Session): Promise<Response> {
  // Re-read the user row so the SPA always sees up-to-date first/last names
  // and admin flags after a profile change. validateSession already touched
  // this row once for authz; the second read is a single primary-key lookup.
  const row = await getUserById(env, session.userId);
  if (!row) return errorResponse(401, "not authenticated");
  return jsonResponse({
    id: row.id,
    email: row.email,
    firstName: row.first_name,
    lastName: row.last_name,
    isAdmin: row.is_admin,
    expiresAt: session.expiresAt,
  });
}

async function handleChangePassword(req: Request, env: Env, session: Session): Promise<Response> {
  let body: { currentPassword?: string; newPassword?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return errorResponse(400, "invalid JSON");
  }
  const result = await changeOwnPassword(
    env,
    session.userId,
    body.currentPassword || "",
    body.newPassword || "",
  );
  if (result.ok) return jsonResponse({ ok: true });
  if (result.reason === "weak")
    return errorResponse(400, "new password must be at least 8 characters");
  if (result.reason === "invalid_current") return errorResponse(401, "current password incorrect");
  return errorResponse(500, "could not change password");
}

async function handleAdmin(
  req: Request,
  env: Env,
  url: URL,
  path: string,
  session: Session,
): Promise<Response> {
  if (path === "/api/admin/users" && req.method === "GET") {
    return listUsersAdmin(env);
  }
  const adminUserMatch = path.match(new RegExp(`^/api/admin/users/(${ID_RE})$`));
  if (adminUserMatch) {
    const id = adminUserMatch[1];
    if (req.method === "PATCH") return patchUserAdmin(req, env, session.userId, id);
    if (req.method === "DELETE") return deleteUserAdmin(env, session.userId, id);
    return errorResponse(405, "method not allowed");
  }

  if (path === "/api/admin/invites") {
    if (req.method === "GET") return listInvitesAdmin(env);
    if (req.method === "POST") {
      const origin = url.origin || req.headers.get("origin") || null;
      return createInviteAdmin(req, env, session.userId, origin);
    }
    return errorResponse(405, "method not allowed");
  }
  const adminInviteMatch = path.match(new RegExp(`^/api/admin/invites/(${TOKEN_RE})$`));
  if (adminInviteMatch && req.method === "DELETE") {
    return revokeInviteAdmin(env, adminInviteMatch[1]);
  }

  return errorResponse(404, "not found");
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
