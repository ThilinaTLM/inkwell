// CORS middleware.
//
// Inkwell normally serves the SPA same-origin from the worker, so CORS
// is a no-op. It only kicks in when `ALLOWED_ORIGINS` is configured —
// e.g. running `vite dev` against a deployed worker. Behavior matches
// the pre-Hono implementation exactly:
//   * preflight (OPTIONS): 204 with the canonical allow headers if the
//     origin is on the allow-list, else a bare 204 with no CORS headers
//   * non-preflight: stamp `access-control-allow-origin`,
//     `access-control-allow-credentials`, and add `vary: origin`
//
// We can't use `hono/cors` directly because that helper's allow-list
// matching doesn't preserve the legacy "no allow-list ⇒ no headers ⇒
// no preflight cookies" behavior we rely on for same-origin SPA usage.

import type { Context, MiddlewareHandler } from "hono";
import type { Env } from "../types";
import type { AppEnv } from "./types";

function corsOrigin(c: Context<AppEnv>): string | null {
  const origin = c.req.header("origin");
  if (!origin) return null;
  const env = c.env as Env;
  const allowed = (env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (allowed.length === 0) return null;
  return allowed.includes(origin) ? origin : null;
}

export const cors: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (c.req.method === "OPTIONS") {
    const origin = corsOrigin(c);
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

  await next();

  const origin = corsOrigin(c);
  if (!origin || !c.res) return;
  // Hono returns the response on c.res; mutate its headers in place.
  c.res.headers.set("access-control-allow-origin", origin);
  c.res.headers.set("access-control-allow-credentials", "true");
  c.res.headers.append("vary", "origin");
};
