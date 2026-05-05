// Invite repository: pure data access for `invites`.

import { and, desc, eq, gt, isNull, or } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import { now } from "../../lib/util";
import type { Env, InviteAdminRow, InviteRow } from "../../types";
import { getDb, t } from "../client";

export async function findByToken(env: Env, token: string): Promise<InviteRow | null> {
  const db = getDb(env);
  const row = await db.select().from(t.invites).where(eq(t.invites.token, token)).get();
  return row ?? null;
}

export async function listAllAdmin(env: Env, limit = 500): Promise<InviteAdminRow[]> {
  const db = getDb(env);
  const cu = alias(t.users, "cu");
  const uu = alias(t.users, "uu");
  const rows = await db
    .select({
      token: t.invites.token,
      created_by: t.invites.created_by,
      created_at: t.invites.created_at,
      expires_at: t.invites.expires_at,
      used_by_user_id: t.invites.used_by_user_id,
      used_at: t.invites.used_at,
      revoked_at: t.invites.revoked_at,
      created_by_email: cu.email,
      used_by_email: uu.email,
    })
    .from(t.invites)
    .leftJoin(cu, eq(cu.id, t.invites.created_by))
    .leftJoin(uu, eq(uu.id, t.invites.used_by_user_id))
    .orderBy(desc(t.invites.created_at))
    .limit(limit)
    .all();
  return rows;
}

export async function insert(
  env: Env,
  row: { token: string; created_by: string; created_at: number; expires_at: number | null },
): Promise<void> {
  const db = getDb(env);
  await db.insert(t.invites).values(row).run();
}

export async function revoke(env: Env, token: string): Promise<void> {
  const db = getDb(env);
  await db.update(t.invites).set({ revoked_at: now() }).where(eq(t.invites.token, token)).run();
}

// Race-safe consume: marks an invite used iff it's still pending. Returns
// true on success, false if another caller won the race.
export async function tryConsume(
  env: Env,
  token: string,
  consumerUserId: string,
): Promise<boolean> {
  const db = getDb(env);
  const result = await db
    .update(t.invites)
    .set({ used_at: Date.now(), used_by_user_id: consumerUserId })
    .where(
      and(
        eq(t.invites.token, token),
        isNull(t.invites.used_at),
        isNull(t.invites.revoked_at),
        or(isNull(t.invites.expires_at), gt(t.invites.expires_at, Date.now())),
      ),
    )
    .run();
  return (result.meta?.changes ?? 0) > 0;
}

// Exposes the (token, used_at) pair so the revoke route can distinguish
// 404 from 409 without pulling the whole row.
export async function findRevokeMeta(
  env: Env,
  token: string,
): Promise<{ used_at: number | null } | null> {
  const db = getDb(env);
  const row = await db
    .select({ token: t.invites.token, used_at: t.invites.used_at })
    .from(t.invites)
    .where(eq(t.invites.token, token))
    .get();
  return row ? { used_at: row.used_at } : null;
}
