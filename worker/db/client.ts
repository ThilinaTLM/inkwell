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

import { is, SQL } from "drizzle-orm";
import { type DrizzleD1Database, drizzle } from "drizzle-orm/d1";
import { SQLiteAsyncDialect } from "drizzle-orm/sqlite-core";
import type { Env } from "../types";
import * as schema from "./schema";

export type DB = DrizzleD1Database<typeof schema>;

export function getDb(env: Env): DB {
  return drizzle(env.DB, { schema });
}

export const t = schema;

// ─── Mixed batches ───────────────────────────────────────────────────────────
// Drizzle's `db.batch` can't take raw `sql` statements (`db.run(sql)`
// has no prepared D1 statement behind it), but the Trash writes need raw
// `WITH RECURSIVE … UPDATE` alongside ordinary builders. This compiles
// each item to SQL + params and runs them as one native D1 batch — same
// single-transaction semantics as `db.batch`.
const dialect = new SQLiteAsyncDialect();

export type BatchStatement = SQL | { toSQL(): { sql: string; params: unknown[] } };

export async function runBatch(env: Env, items: readonly BatchStatement[]): Promise<void> {
  if (items.length === 0) return;
  const stmts = items.map((item) => {
    const q = is(item, SQL) ? dialect.sqlToQuery(item) : item.toSQL();
    return env.DB.prepare(q.sql).bind(...q.params);
  });
  await env.DB.batch(stmts);
}
