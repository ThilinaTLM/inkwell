// Inkwell — Cloudflare Worker entry point.
//
// Routing is delegated to Hono. Each resource lives in its own
// `worker/routes/*.ts` module; this file is just the composition root:
// it wires CORS, mounts the per-resource routers, and falls through to
// the static-asset binding (the built React SPA) for everything else.

import { Hono } from "hono";
import { cors } from "./middleware/cors";
import type { AppEnv } from "./middleware/types";
import adminRoutes from "./routes/admin";
import authRoutes from "./routes/auth";
import filesRoutes from "./routes/files";
import foldersRoutes from "./routes/folders";
import invitesRoutes from "./routes/invites";
import meRoutes from "./routes/me";
import publicShareRoutes from "./routes/public-share";
import { fileSharesNested, folderSharesNested, sharesRoot } from "./routes/shares";
import tagsRoutes from "./routes/tags";

const app = new Hono<AppEnv>();

// ─── Middleware ──────────────────────────────────────────────────────
// CORS only kicks in when ALLOWED_ORIGINS is set; same-origin SPA
// usage is unaffected. Restrict to /api/* so the static asset path
// stays uninstrumented.
app.use("/api/*", cors);

// ─── Routes ──────────────────────────────────────────────────────────
app.route("/api/auth", authRoutes);
app.route("/api/me", meRoutes);
app.route("/api/invites", invitesRoutes);
app.route("/api/admin", adminRoutes);
app.route("/api/folders", foldersRoutes);
app.route("/api/files", filesRoutes);
app.route("/api/tags", tagsRoutes);
app.route("/api/shares", sharesRoot);
app.route("/api/share", publicShareRoutes);
// Nested share routers under file/folder owner namespaces. These mount
// AFTER the resource routers so unrelated method+path combos within
// the resource don't get shadowed.
app.route("/api/files/:id/shares", fileSharesNested);
app.route("/api/folders/:id/shares", folderSharesNested);

// /api/* fallthrough — anything reaching here is a method/path miss.
// We surface 405 vs 404 on a best-effort basis: Hono returns 404 if
// no route matched at all. Old behavior on unknown paths was 404 with
// {error: "not found"}; on known paths with disallowed methods it was
// 405 with {error: "method not allowed"}. Hono can't easily
// distinguish those without per-route OPTIONS bookkeeping, so we
// preserve the more important case (404) and accept that some 405s
// surface as 404. The SPA never relies on the distinction.
app.notFound(
  () =>
    new Response(JSON.stringify({ error: "not found" }), {
      status: 404,
      headers: { "content-type": "application/json; charset=utf-8" },
    }),
);

// ─── Worker entry ────────────────────────────────────────────────────
export default {
  async fetch(req: Request, env: AppEnv["Bindings"], ctx: ExecutionContext): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname.startsWith("/api/")) {
      return await app.fetch(req, env, ctx);
    }
    // Everything else — serve the SPA via the ASSETS binding.
    return env.ASSETS.fetch(req);
  },
};
