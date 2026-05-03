// Per-request Drizzle client over the D1 binding.
//
// Drizzle's D1 wrapper is a thin object that holds the binding and a schema
// reference; constructing one per call is effectively free, so handlers
// just call `getDb(env)` at the top instead of threading a `db` parameter
// through every signature.
//
// Usage:
//   const db = getDb(env);
//   const row = await db.select().from(t.users).where(eq(t.users.id, id)).get();
//
// `t` re-exports the schema namespace so call sites have a single import:
//   import { getDb, t } from "./db/client";

import { type DrizzleD1Database, drizzle } from "drizzle-orm/d1";
import type { Env } from "../types";
import * as schema from "./schema";

export type DB = DrizzleD1Database<typeof schema>;

export function getDb(env: Env): DB {
  return drizzle(env.DB, { schema });
}

export const t = schema;
