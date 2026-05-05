// Share repository: pure data access for `shares`.

import { and, count, desc, eq, gt, inArray, isNull, or, sql } from "drizzle-orm";
import { now } from "../../lib/util";
import type { Env, SharePublic, ShareRow, ShareTargetType } from "../../types";
import { isShareActive, rowToSharePublic } from "../../types";
import { getDb, t } from "../client";

export async function findByToken(env: Env, token: string): Promise<ShareRow | null> {
  const db = getDb(env);
  const row = await db.select().from(t.shares).where(eq(t.shares.token, token)).get();
  return row ?? null;
}

// Token resolution for public endpoints: the token must exist and be active.
export async function findActive(env: Env, token: string): Promise<ShareRow | null> {
  const row = await findByToken(env, token);
  if (!row) return null;
  if (!isShareActive(row, Date.now())) return null;
  return row;
}

// Owner-scoped token lookup.
export async function findByTokenForOwner(
  env: Env,
  owner: string,
  token: string,
): Promise<ShareRow | null> {
  const db = getDb(env);
  const row = await db
    .select()
    .from(t.shares)
    .where(and(eq(t.shares.token, token), eq(t.shares.owner, owner)))
    .get();
  return row ?? null;
}

export async function listForTarget(
  env: Env,
  owner: string,
  targetType: ShareTargetType,
  targetId: string,
): Promise<ShareRow[]> {
  const db = getDb(env);
  return await db
    .select()
    .from(t.shares)
    .where(
      and(
        eq(t.shares.owner, owner),
        eq(t.shares.target_type, targetType),
        eq(t.shares.target_id, targetId),
      ),
    )
    .orderBy(desc(t.shares.created_at))
    .all();
}

// Owner's full share inventory for /shares page. Joins the target name
// from files/folders so the SPA can render "<filename>" without a second
// fetch per row.
export async function listAllForOwnerWithTarget(env: Env, owner: string): Promise<SharePublic[]> {
  const db = getDb(env);
  const rows = await db
    .select({
      share: t.shares,
      target_name: sql<string | null>`CASE ${t.shares.target_type}
        WHEN 'file'   THEN ${t.files.name}
        WHEN 'folder' THEN ${t.folders.name}
      END`,
    })
    .from(t.shares)
    .leftJoin(t.files, and(eq(t.shares.target_type, "file"), eq(t.files.id, t.shares.target_id)))
    .leftJoin(
      t.folders,
      and(eq(t.shares.target_type, "folder"), eq(t.folders.id, t.shares.target_id)),
    )
    .where(and(eq(t.shares.owner, owner), isNull(t.shares.revoked_at)))
    .orderBy(desc(t.shares.created_at))
    .all();
  return rows.map((r) => rowToSharePublic(r.share, r.target_name ?? undefined));
}

export async function insert(env: Env, row: ShareRow): Promise<void> {
  const db = getDb(env);
  await db.insert(t.shares).values(row).run();
}

export async function update(
  env: Env,
  owner: string,
  token: string,
  patch: Partial<ShareRow>,
): Promise<void> {
  const db = getDb(env);
  await db
    .update(t.shares)
    .set(patch)
    .where(and(eq(t.shares.token, token), eq(t.shares.owner, owner)))
    .run();
}

// Soft-revoke. Returns true iff a row actually flipped (false if already
// revoked or not owned by this user).
export async function revoke(env: Env, owner: string, token: string): Promise<boolean> {
  const db = getDb(env);
  const result = await db
    .update(t.shares)
    .set({ revoked_at: now() })
    .where(and(eq(t.shares.token, token), eq(t.shares.owner, owner), isNull(t.shares.revoked_at)))
    .run();
  return (result.meta?.changes ?? 0) > 0;
}

// Bumps `last_accessed_at`. Errors are swallowed by the caller — this
// runs on a `ctx.waitUntil` boundary and a failure should not break the
// public read.
export async function touchAccess(env: Env, token: string): Promise<void> {
  const db = getDb(env);
  await db.update(t.shares).set({ last_accessed_at: now() }).where(eq(t.shares.token, token)).run();
}

// Active share count per target id. Powers the "shared" pill on file
// and folder cards. Single grouped query, indexed.
export async function countActiveByTarget(
  env: Env,
  owner: string,
  targetType: ShareTargetType,
  ids: string[],
): Promise<Map<string, number>> {
  if (ids.length === 0) return new Map();
  const db = getDb(env);
  const nowMs = Date.now();
  const rows = await db
    .select({ id: t.shares.target_id, n: count() })
    .from(t.shares)
    .where(
      and(
        eq(t.shares.owner, owner),
        eq(t.shares.target_type, targetType),
        inArray(t.shares.target_id, ids),
        isNull(t.shares.revoked_at),
        or(isNull(t.shares.expires_at), gt(t.shares.expires_at, nowMs)),
      ),
    )
    .groupBy(t.shares.target_id)
    .all();
  const map = new Map<string, number>();
  for (const r of rows) map.set(r.id, r.n);
  return map;
}
