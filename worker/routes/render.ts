// Static-site asset render endpoints.
//
// Two routers are exported, mounted at top-level paths in
// `worker/index.ts`:
//
//   * `ownerSites`  → `/sites/:id/:sig/<relpath>`
//                     Owner-minted signed URLs. Sig payload is
//                     `ownerRenderPayload(id, owner)` so it's
//                     bound to (this file, this owner).
//
//   * `sharedSites` → `/shared/:token/:sig/<relpath>`
//                     Share-token-minted signed URLs. Sig payload is
//                     `shareRenderPayload(token, id)`. Each request
//                     also re-checks `sharesRepo.findActive` so
//                     revoking a share kills outstanding URLs in
//                     flight even though the sig hasn't expired yet.
//
// Both flavors live OUTSIDE `/api/*`. The `/api/*` namespace is
// reserved for session-authed JSON endpoints; these routes serve
// uploader HTML/CSS/JS bytes and are authorized strictly by the HMAC
// signature in the URL path (the signing secret never leaves the
// worker). Keeping them on their own top-level paths also keeps the
// URL you see in "Open in new tab" looking like a regular site URL,
// not an API call.
//
// ─── Cookies vs. signatures ──────────────────────────────────────
//
// The two routers differ in how they authenticate:
//
//   * `ownerSites` REQUIRES a session cookie. `requireSession` runs
//     before every handler and `row.owner === session.userId` is
//     re-checked per request. The HMAC signature stays as a
//     TTL-bound defense in depth that binds the URL to (file, owner)
//     and prevents id-substitution attacks. Sub-resource requests
//     (`<script>`, `<img>`, `<link>`) inside the rendered HTML carry
//     the cookie because they are same-origin GETs and the cookie is
//     `SameSite=Lax`.
//
//   * `sharedSites` is cookie-less by design — a share-token URL is
//     the credential. Each request re-resolves the share row via
//     `sharesRepo.findActive`, so revoke/expire take effect
//     immediately even though the sig TTL hasn't elapsed.
//
// ─── Access-control invariants ────────────────────────────────────
//
//   1. `ownerRenderPayload` and `shareRenderPayload` produce
//      structurally different strings ("owner|…" vs "share|…"). An
//      owner-minted signature literally cannot HMAC-verify against the
//      share verifier and vice versa.
//   2. Each route handler hard-codes the matching payload builder.
//      Param names differ (`:id` vs `:token`) so there's no shape
//      under which the wrong path could feed the wrong verifier.
//   3. The owner route additionally requires a session cookie and
//      that the authenticated user owns the file. The share routes
//      additionally re-query the share row on every request and
//      reject if the share is gone, expired, or no longer covers the
//      requested file.
//   4. Asset paths are resolved by exact Map lookup against the
//      manifest, so `..`-style traversal in the relpath segment
//      cannot escape the bundle even if it somehow reached the
//      resolver (it doesn't; HMAC verification gates it first).
//
// Any future change to these routes must preserve all four
// invariants — especially #1 (payload separation) and #2 (the
// verifier-vs-handler binding).

import { Hono } from "hono";
import * as filesRepo from "../db/repos/files";
import * as foldersRepo from "../db/repos/folders";
import * as sharesRepo from "../db/repos/shares";
import { ownerRenderPayload, shareRenderPayload, verifyRender } from "../lib/crypto";
import { errorResponse } from "../lib/responses";
import { requireSession } from "../middleware/auth";
import type { AppEnv } from "../middleware/types";
import { r2StaticSiteAssetKey, readManifest } from "../services/static-site";
import type { Env, FileRow, StaticSiteFileBlob } from "../types";

// ─── Owner-minted (mounted at `/sites`) ───────────────────────────
// Hono's bare `*` wildcard isn't exposed as a named param, so we use
// `:path{.*}` (regex-named, matches empty so the root request
// resolves to `manifest.entry`).
const ownerSites = new Hono<AppEnv>();
ownerSites.use("*", requireSession);

ownerSites.get("/:id/:sig/:path{.*}", async (c) => {
  const session = c.get("session");
  const id = c.req.param("id");
  const sig = c.req.param("sig");
  const relpath = c.req.param("path") ?? "";
  if (!id || !sig) return errorResponse(404, "not found");

  const row = await filesRepo.findByIdAnyOwner(c.env, id);
  if (!row || row.kind !== "static-site") return errorResponse(404, "not found");

  // Ownership check: the signed URL binds to (file, owner) but the
  // authoritative gate is the session cookie. An attacker who obtains
  // a sig URL out-of-band (URL leak, browser history sync, etc.)
  // still can't replay it without being signed in as the owner.
  if (row.owner !== session.userId) return errorResponse(403, "not authorized");

  // Verifier is locked to `ownerRenderPayload`. A share-minted sig
  // produces a payload starting with "share|" and therefore cannot
  // satisfy this check — see "Access-control invariants" above.
  const ok = await verifyRender(c.env.SESSION_SECRET, sig, ownerRenderPayload(row.id, row.owner));
  if (!ok) return errorResponse(403, "expired or invalid render session");

  return await serveAsset(c.env, row, relpath);
});

// ─── Share-token-minted (mounted at `/shared`) ────────────────────
//
// Two URL shapes:
//
//   * File share:   `/shared/:token/:sig/<relpath>`
//   * Folder share: `/shared/:token/files/:fileId/:sig/<relpath>`
//
// The folder-share shape carries the file id explicitly because a
// single folder share can host many static-site files; the sig still
// binds to (token, fileId) via `shareRenderPayload`. Route order
// matters: the folder-share route below is declared first so Hono's
// literal `files` segment wins over the `:sig` capture in the
// file-share route.
const sharedSites = new Hono<AppEnv>();

sharedSites.get("/:token/files/:fileId/:sig/:path{.*}", async (c) => {
  const token = c.req.param("token");
  const fileId = c.req.param("fileId");
  const sig = c.req.param("sig");
  const relpath = c.req.param("path") ?? "";
  if (!token || !fileId || !sig) return errorResponse(404, "not found");

  const share = await sharesRepo.findActive(c.env, token);
  if (!share || share.target_type !== "folder") {
    return errorResponse(403, "share is no longer active");
  }
  if (!(await foldersRepo.fileInSubtree(c.env, share.owner, fileId, share.target_id))) {
    return errorResponse(403, "file not in shared folder");
  }

  const row = await filesRepo.findByIdAnyOwner(c.env, fileId);
  if (!row || row.kind !== "static-site") return errorResponse(404, "not found");

  // Same verifier as the file-share path: `shareRenderPayload(token,
  // fileId)`. The fileId is part of the URL, so a folder-share sig
  // minted for file A cannot be replayed against file B.
  const ok = await verifyRender(c.env.SESSION_SECRET, sig, shareRenderPayload(token, fileId));
  if (!ok) return errorResponse(403, "expired or invalid render session");

  return await serveAsset(c.env, row, relpath);
});

sharedSites.get("/:token/:sig/:path{.*}", async (c) => {
  const token = c.req.param("token");
  const sig = c.req.param("sig");
  const relpath = c.req.param("path") ?? "";
  if (!token || !sig) return errorResponse(404, "not found");

  // Re-check share is still active. Owner-minted signatures don't
  // need this because if the file is deleted, the manifest 404s
  // below; but a share can be revoked while the file is still alive
  // and we want revocation to take effect immediately rather than
  // waiting for the 30-minute signature TTL.
  const share = await sharesRepo.findActive(c.env, token);
  if (!share || share.target_type !== "file") {
    return errorResponse(403, "share is no longer active");
  }

  const row = await filesRepo.findByIdAnyOwner(c.env, share.target_id);
  if (!row || row.kind !== "static-site") return errorResponse(404, "not found");

  // Verifier is locked to `shareRenderPayload`. An owner-minted sig
  // produces a payload starting with "owner|" and therefore cannot
  // satisfy this check — see "Access-control invariants" above.
  const ok = await verifyRender(c.env.SESSION_SECRET, sig, shareRenderPayload(token, row.id));
  if (!ok) return errorResponse(403, "expired or invalid render session");

  return await serveAsset(c.env, row, relpath);
});

// ─── Asset resolver + serve ───────────────────────────────────────
async function serveAsset(env: Env, row: FileRow, relpath: string): Promise<Response> {
  const manifest = await readManifest(env, row.id);
  if (!manifest) return errorResponse(500, "manifest missing");

  const resolved = resolveAssetPath(manifest, relpath);
  if (!resolved) return errorResponse(404, "asset not found");

  const obj = await env.R2.get(r2StaticSiteAssetKey(row.id, resolved.path));
  if (!obj) return errorResponse(404, "asset missing in R2");

  // CSP rationale: this content is the uploader's own HTML/CSS/JS.
  // We deliberately allow loose `script-src` / `style-src` (incl.
  // `'unsafe-inline'`/`'unsafe-eval'`) so the uploader's site behaves
  // the way it was authored. The real security boundary is the
  // dedicated tab — `frame-ancestors 'self'` plus `X-Frame-Options:
  // SAMEORIGIN` ensure only Inkwell-origin pages can iframe these
  // assets, which prevents an attacker from embedding a victim's
  // signed URL inside a phishing page.
  //
  // `Referrer-Policy: no-referrer` keeps the signed URL out of
  // outbound link Referer headers (so a click from inside the user's
  // site doesn't leak the HMAC to third parties).
  const headers = new Headers();
  headers.set("content-type", resolved.contentType);
  headers.set("cache-control", "private, max-age=300");
  headers.set("x-content-type-options", "nosniff");
  headers.set("x-frame-options", "SAMEORIGIN");
  headers.set("referrer-policy", "no-referrer");
  headers.set(
    "content-security-policy",
    "default-src 'self' data: blob: https:; " +
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' data: blob: https:; " +
      "style-src 'self' 'unsafe-inline' data: blob: https:; " +
      "img-src 'self' data: blob: https:; " +
      "font-src 'self' data: blob: https:; " +
      "frame-ancestors 'self'",
  );
  if (obj.httpEtag) headers.set("etag", obj.httpEtag);

  return new Response(obj.body, { headers });
}

/** Resolve a request relpath to an actual manifest entry.
 *
 *  * "" or trailing-slash → look for `<base>index.html` in the
 *    manifest. For the empty root case, fall back to `manifest.entry`.
 *  * exact path hit → return that asset.
 *  * otherwise → null (404).
 *
 *  Path traversal (`..`) cannot escape the bundle: we look up assets
 *  by exact Map key, never by file-system path. The HMAC gate before
 *  this function is the real defense in depth.
 */
function resolveAssetPath(
  manifest: StaticSiteFileBlob,
  relpath: string,
): { path: string; contentType: string } | null {
  // Normalize: collapse leading slashes; we don't accept ".." but the
  // signed prefix isolation makes that moot.
  let p = relpath.replace(/^\/+/, "");

  const byPath = new Map(manifest.assets.map((a) => [a.path, a]));

  // Root request → manifest.entry.
  if (p === "" || p === "/") {
    const hit = byPath.get(manifest.entry);
    return hit ? { path: hit.path, contentType: hit.contentType } : null;
  }

  // Directory-style request → look for index.html under it.
  if (p.endsWith("/")) {
    p = `${p}index.html`;
  }

  const hit = byPath.get(p);
  return hit ? { path: hit.path, contentType: hit.contentType } : null;
}

export { ownerSites, sharedSites };
