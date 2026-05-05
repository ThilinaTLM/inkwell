// JSON body parsing helper.
//
// Replaces ~14 inline try/catch parsers in the old handlers. Two modes:
//   * `parseJson<T>(c)`: returns parsed body or a 400 response on
//     malformed JSON. The route checks `if (parsed instanceof Response)
//     return parsed`.
//   * `parseJsonOrEmpty<T>(c)`: returns parsed body or `{}` on missing /
//     malformed JSON. Used by routes whose body fields are all optional
//     and where an empty body is a no-op (e.g. createFile with all
//     defaults, share create with default permission).

import type { Context } from "hono";
import { errorResponse } from "../lib/responses";
import type { AppEnv } from "./types";

export async function parseJson<T>(c: Context<AppEnv>): Promise<T | Response> {
  try {
    return (await c.req.raw.json()) as T;
  } catch {
    return errorResponse(400, "invalid JSON");
  }
}

export async function parseJsonOrEmpty<T>(c: Context<AppEnv>): Promise<T> {
  try {
    return (await c.req.raw.json()) as T;
  } catch {
    return {} as T;
  }
}
