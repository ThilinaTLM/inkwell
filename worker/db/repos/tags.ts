// Tag repository: pure data access for `tags` and `taggings`.
//
// Includes the shared "normalize a string into a tag name" helpers so
// every route uses the same length cap + lowercasing rules.

import { and, eq, inArray, sql } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import { newId } from "../../lib/crypto";
import { now } from "../../lib/util";
import type { Env, TagPublic, TagRow, TagTargetType } from "../../types";
import { getDb, t } from "../client";

type SqliteBatchItem = BatchItem<"sqlite">;

const MAX_TAG_LENGTH = 50;
const MAX_TAGS_PER_TARGET = 20;

// ─── Normalization (shared) ──────────────────────────────────────────
export function normalizeTagName(raw: string): string | null {
  if (typeof raw !== "string") return null;
  const n = raw.trim().toLowerCase();
  if (!n) return null;
  if (n.length > MAX_TAG_LENGTH) return null;
  return n;
}

export function normalizeTagSet(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const r of raw) {
    const n = normalizeTagName(typeof r === "string" ? r : "");
    if (!n || seen.has(n)) continue;
    seen.add(n);
    out.push(n);
    if (out.length >= MAX_TAGS_PER_TARGET) break;
  }
  return out;
}

// ─── Reads ───────────────────────────────────────────────────────────
export async function findById(env: Env, owner: string, id: string): Promise<TagRow | null> {
  const db = getDb(env);
  const row = await db
    .select()
    .from(t.tags)
    .where(and(eq(t.tags.id, id), eq(t.tags.owner, owner)))
    .get();
  return row ?? null;
}

export async function findByName(
  env: Env,
  owner: string,
  name: string,
): Promise<{ id: string } | null> {
  const db = getDb(env);
  const row = await db
    .select({ id: t.tags.id })
    .from(t.tags)
    .where(and(eq(t.tags.owner, owner), eq(t.tags.name, name)))
    .get();
  return row ?? null;
}

export async function listForOwnerWithCounts(env: Env, owner: string): Promise<TagPublic[]> {
  const db = getDb(env);
  const rows = await db
    .select({
      id: t.tags.id,
      name: t.tags.name,
      file_count: sql<number>`SUM(CASE WHEN ${t.taggings.target_type} = 'file'   THEN 1 ELSE 0 END)`,
      folder_count: sql<number>`SUM(CASE WHEN ${t.taggings.target_type} = 'folder' THEN 1 ELSE 0 END)`,
    })
    .from(t.tags)
    .leftJoin(t.taggings, eq(t.taggings.tag_id, t.tags.id))
    .where(eq(t.tags.owner, owner))
    .groupBy(t.tags.id)
    .orderBy(sql`${t.tags.name} COLLATE NOCASE ASC`)
    .all();
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    fileCount: r.file_count ?? 0,
    folderCount: r.folder_count ?? 0,
  }));
}

export async function listForEntity(
  env: Env,
  targetType: TagTargetType,
  targetId: string,
): Promise<string[]> {
  const db = getDb(env);
  const rows = await db
    .select({ name: t.tags.name })
    .from(t.taggings)
    .innerJoin(t.tags, eq(t.tags.id, t.taggings.tag_id))
    .where(and(eq(t.taggings.target_type, targetType), eq(t.taggings.target_id, targetId)))
    .orderBy(sql`${t.tags.name} COLLATE NOCASE`)
    .all();
  return rows.map((r) => r.name);
}

export async function collectForMany(
  env: Env,
  targetType: TagTargetType,
  targetIds: string[],
): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  if (targetIds.length === 0) return out;
  const db = getDb(env);
  const rows = await db
    .select({ id: t.taggings.target_id, name: t.tags.name })
    .from(t.taggings)
    .innerJoin(t.tags, eq(t.tags.id, t.taggings.tag_id))
    .where(and(eq(t.taggings.target_type, targetType), inArray(t.taggings.target_id, targetIds)))
    .orderBy(sql`${t.tags.name} COLLATE NOCASE`)
    .all();
  for (const r of rows) {
    const arr = out.get(r.id);
    if (arr) arr.push(r.name);
    else out.set(r.id, [r.name]);
  }
  return out;
}

// ─── Writes ──────────────────────────────────────────────────────────
// Replaces the tag set on a target, creating any missing tag rows.
// Returns the (normalized) tag list now attached to the target.
export async function replaceForEntity(
  env: Env,
  owner: string,
  targetType: TagTargetType,
  targetId: string,
  raw: unknown,
): Promise<string[]> {
  const desired = normalizeTagSet(raw);
  const db = getDb(env);
  const ts = now();

  // Resolve tag ids — looking up existing rows and inserting missing ones.
  // Done as individual round-trips (one per desired tag) because D1 lacks
  // an upsert-and-return primitive that respects our app-generated ids.
  const tagIds: string[] = [];
  for (const name of desired) {
    const existing = await db
      .select({ id: t.tags.id })
      .from(t.tags)
      .where(and(eq(t.tags.owner, owner), eq(t.tags.name, name)))
      .get();
    if (existing) {
      tagIds.push(existing.id);
    } else {
      const id = newId();
      await db.insert(t.tags).values({ id, owner, name, created_at: ts }).run();
      tagIds.push(id);
    }
  }

  // Replace the tagging set + GC orphan tags atomically. D1 batches run
  // in an implicit transaction, so this closes the delete-then-insert
  // race the previous implementation had.
  const head: SqliteBatchItem = db
    .delete(t.taggings)
    .where(and(eq(t.taggings.target_type, targetType), eq(t.taggings.target_id, targetId)));
  const inserts: SqliteBatchItem[] = tagIds.map((tagId) =>
    db
      .insert(t.taggings)
      .values({
        tag_id: tagId,
        target_type: targetType,
        target_id: targetId,
        owner,
        created_at: ts,
      })
      .onConflictDoNothing(),
  );
  // Garbage-collect tags that no longer have any taggings.
  const gc: SqliteBatchItem = db
    .delete(t.tags)
    .where(
      and(
        eq(t.tags.owner, owner),
        sql`${t.tags.id} NOT IN (SELECT DISTINCT ${t.taggings.tag_id} FROM ${t.taggings} WHERE ${t.taggings.owner} = ${owner})`,
      ),
    );
  await db.batch([head, ...inserts, gc]);
  return desired;
}

// Rename `id` to `next`. If a different tag with `next` already exists,
// merge taggings into it and delete the old row. Returns the canonical
// id+name post-merge (which may be a different id than the input).
export async function rename(
  env: Env,
  owner: string,
  id: string,
  current: TagRow,
  next: string,
): Promise<{ id: string; name: string }> {
  const db = getDb(env);
  if (next === current.name) return { id: current.id, name: current.name };
  const existing = await findByName(env, owner, next);
  if (existing) {
    await db.batch([
      db.run(
        sql`INSERT OR IGNORE INTO ${t.taggings} (tag_id, target_type, target_id, owner, created_at)
            SELECT ${existing.id}, target_type, target_id, owner, created_at
            FROM ${t.taggings} WHERE ${t.taggings.tag_id} = ${id}`,
      ),
      db.delete(t.tags).where(eq(t.tags.id, id)),
    ]);
    return { id: existing.id, name: next };
  }
  await db
    .update(t.tags)
    .set({ name: next })
    .where(and(eq(t.tags.id, id), eq(t.tags.owner, owner)))
    .run();
  return { id, name: next };
}

export async function remove(env: Env, owner: string, id: string): Promise<void> {
  const db = getDb(env);
  await db
    .delete(t.tags)
    .where(and(eq(t.tags.id, id), eq(t.tags.owner, owner)))
    .run();
}
