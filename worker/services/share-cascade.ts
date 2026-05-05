// Multi-write share operations: rotate (revoke + reissue).

import { and, eq } from "drizzle-orm";
import { getDb, t } from "../db/client";
import { newToken } from "../lib/crypto";
import { now } from "../lib/util";
import type { Env, ShareRow } from "../types";

// Rotate: revoke the current row and insert a fresh one with the same
// settings. Returns the fresh row. Caller has already validated that
// the share exists, is owned by the caller, and is not revoked.
//
// Two writes batched via `db.batch` to keep them atomic where supported;
// even on partial failure the worst case is a new row alongside an
// active old row, which the user can manually revoke.
export async function rotateShare(env: Env, owner: string, current: ShareRow): Promise<ShareRow> {
  const ts = now();
  const newTokenStr = newToken();
  const db = getDb(env);
  await db.batch([
    db
      .update(t.shares)
      .set({ revoked_at: ts })
      .where(and(eq(t.shares.token, current.token), eq(t.shares.owner, owner))),
    db.insert(t.shares).values({
      token: newTokenStr,
      owner,
      target_type: current.target_type,
      target_id: current.target_id,
      permission: current.permission,
      allow_download: current.allow_download,
      label: current.label,
      created_at: ts,
      expires_at: current.expires_at,
    }),
  ]);
  return {
    token: newTokenStr,
    owner,
    target_type: current.target_type,
    target_id: current.target_id,
    permission: current.permission,
    allow_download: current.allow_download,
    label: current.label,
    created_at: ts,
    expires_at: current.expires_at,
    revoked_at: null,
    last_accessed_at: null,
  };
}
