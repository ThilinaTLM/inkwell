// Auth middleware: requireSession + requireAdmin.
//
// `requireSession` parses the cookie, verifies HMAC + expiry, re-loads
// the user row (so disable/demote/delete take effect immediately) and
// stores the resulting `Session` on the request context.
//
// `requireAdmin` depends on `requireSession`; mount it underneath so
// the session is already on `c.var`.

import type { MiddlewareHandler } from "hono";
import { validateSession } from "../auth";
import { errorResponse } from "../lib/responses";
import type { AppEnv } from "./types";

export const requireSession: MiddlewareHandler<AppEnv> = async (c, next) => {
  const session = await validateSession(c.req.raw, c.env);
  if (!session) return errorResponse(401, "not authenticated");
  c.set("session", session);
  await next();
};

export const requireAdmin: MiddlewareHandler<AppEnv> = async (c, next) => {
  const session = c.get("session");
  if (!session) return errorResponse(401, "not authenticated");
  if (!session.isAdmin) return errorResponse(403, "forbidden");
  await next();
};
