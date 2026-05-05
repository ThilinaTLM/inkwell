// Share-token middleware.
//
// Resolves `:token` against the `shares` table, verifies the token is
// active (not revoked, not expired), and stores the row on `c.var.share`.
// Also fires `last_accessed_at` via `ctx.waitUntil` so reads are tracked
// without blocking the response.
//
// Composable opts:
//   * `target`: restrict to "file" or "folder" target. Mismatches return
//     a tailored 404 message preserving the pre-Hono wording.
//   * `needsWrite`: require permission === "write". Returns 403 on read.
//
// The middleware does NOT enforce per-target authorization beyond the
// target-type check (e.g. "file lives inside this folder share's
// subtree") — that's left to the route since the message text varies.

import type { MiddlewareHandler } from "hono";
import * as sharesRepo from "../db/repos/shares";
import { errorResponse } from "../lib/responses";
import type { ShareTargetType } from "../types";
import type { AppEnv } from "./types";

interface ShareTokenOpts {
  target?: ShareTargetType;
  needsWrite?: boolean;
  /** Custom 404 message when the target type doesn't match. */
  targetMismatchMessage?: string;
}

export function requireShareToken(opts: ShareTokenOpts = {}): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const token = c.req.param("token");
    if (!token) return errorResponse(404, "invalid or expired token");
    const row = await sharesRepo.findActive(c.env, token);
    if (!row) return errorResponse(404, "invalid or expired token");
    if (opts.target && row.target_type !== opts.target) {
      return errorResponse(404, opts.targetMismatchMessage ?? "invalid or expired token");
    }
    if (opts.needsWrite && row.permission !== "write") {
      return errorResponse(403, "read-only token");
    }
    c.set("share", row);

    // Fire-and-forget last-access tracker.
    const ctx = c.executionCtx;
    if (ctx) {
      ctx.waitUntil(sharesRepo.touchAccess(c.env, token).catch(() => undefined));
    }

    await next();
  };
}
