// Shared query fragments.
//
// `notTrashed` is THE trash filter: every owner- or share-facing read of
// `files`/`folders` must include it, so that items in Trash are invisible
// everywhere except the trash endpoints (`services/trash.ts`). The
// invariant that makes a per-row check sufficient: a live row never has a
// trashed ancestor — trashing a folder marks its whole live subtree, you
// can't move/create into a trashed folder, and restoring an item whose
// parent is still trashed relocates it to the root.
//
// `inIds` binds an id list as ONE JSON parameter and expands it with
// `json_each`. D1 caps bound parameters per statement at 100, so the
// bulk endpoints (up to 500 refs) can't use `inArray`.

import { isNull, type SQL, sql } from "drizzle-orm";
import type { AnySQLiteColumn } from "drizzle-orm/sqlite-core";
import type { t } from "./client";

export function notTrashed(table: typeof t.files | typeof t.folders): SQL {
  return isNull(table.deleted_at);
}

export function inIds(col: AnySQLiteColumn | SQL, ids: readonly string[]): SQL {
  return sql`${col} IN (SELECT value FROM json_each(${JSON.stringify(ids)}))`;
}

/** Split `arr` into chunks of at most `size` (used to keep multi-row
 *  INSERTs under D1's 100-bound-parameter limit). */
export function chunk<T>(arr: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}
