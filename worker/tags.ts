// Tag CRUD helpers.
//
// A tag has per-user identity: `tags(id, owner, name)` with a unique
// `(owner, name)` index. `name` is normalized as `trim().toLowerCase()`
// and capped at 50 characters. Tags attach to files or folders via the
// polymorphic `taggings` table.
//
// API surface intentionally small:
//   * listTags(env, owner)            → for the sidebar with counts.
//   * renameTag / deleteTag           → admin-style edits.
//   * listTagsFor(targetType, id)     → for rendering on a card.
//   * replaceTagsFor(...)             → atomic set replacement on a target.
//   * collectTagsForMany(...)         → batch fetch tags for a list of cards.
//
// All write paths upsert tags lazily — no separate "create tag" call.

import { and, eq, inArray, sql } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import { getDb, t } from "./db/client";
import type { Env, TagPublic, TagTargetType } from "./types";
import { errorResponse, jsonResponse, newId, now } from "./util";

type SqliteBatchItem = BatchItem<"sqlite">;

const MAX_TAG_LENGTH = 50;
const MAX_TAGS_PER_TARGET = 20;

// ─── Normalization ────────────────────────────────────────────────────
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

// ─── Read paths ───────────────────────────────────────────────────────
export async function listTags(env: Env, owner: string): Promise<Response> {
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
  const tags: TagPublic[] = rows.map((r) => ({
    id: r.id,
    name: r.name,
    fileCount: r.file_count ?? 0,
    folderCount: r.folder_count ?? 0,
  }));
  return jsonResponse({ tags });
}

export async function listTagsFor(
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

// Batch loader: returns a Map<targetId, string[]> for the given ids.
export async function collectTagsForMany(
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

// ─── Write paths ──────────────────────────────────────────────────────
// Replaces the tag set on a target, creating any missing tag rows.
// Returns the (normalized) tag list now attached to the target.
export async function replaceTagsFor(
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
    let row = await db
      .select({ id: t.tags.id })
      .from(t.tags)
      .where(and(eq(t.tags.owner, owner), eq(t.tags.name, name)))
      .get();
    if (!row) {
      const id = newId();
      await db.insert(t.tags).values({ id, owner, name, created_at: ts }).run();
      row = { id };
    }
    tagIds.push(row.id);
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

// PATCH /api/tags/:id — rename a tag everywhere.
export async function renameTag(
  req: Request,
  env: Env,
  owner: string,
  id: string,
): Promise<Response> {
  const db = getDb(env);
  const tag = await db
    .select()
    .from(t.tags)
    .where(and(eq(t.tags.id, id), eq(t.tags.owner, owner)))
    .get();
  if (!tag) return errorResponse(404, "tag not found");
  let body: { name?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return errorResponse(400, "invalid JSON");
  }
  const next = normalizeTagName(body.name ?? "");
  if (!next) return errorResponse(400, "invalid tag name");
  if (next === tag.name) {
    return jsonResponse({ id: tag.id, name: tag.name });
  }
  // If a tag with the new name already exists for this owner, merge
  // taggings into it and delete the old row.
  const existing = await db
    .select({ id: t.tags.id })
    .from(t.tags)
    .where(and(eq(t.tags.owner, owner), eq(t.tags.name, next)))
    .get();
  if (existing) {
    // Merge: rewrite taggings to point at the existing tag, dedupe.
    await db.batch([
      db.run(
        sql`INSERT OR IGNORE INTO ${t.taggings} (tag_id, target_type, target_id, owner, created_at)
            SELECT ${existing.id}, target_type, target_id, owner, created_at
            FROM ${t.taggings} WHERE ${t.taggings.tag_id} = ${id}`,
      ),
      db.delete(t.tags).where(eq(t.tags.id, id)),
    ]);
    return jsonResponse({ id: existing.id, name: next });
  }
  await db
    .update(t.tags)
    .set({ name: next })
    .where(and(eq(t.tags.id, id), eq(t.tags.owner, owner)))
    .run();
  return jsonResponse({ id, name: next });
}

// DELETE /api/tags/:id — drop the tag (and its taggings via FK CASCADE).
export async function deleteTag(env: Env, owner: string, id: string): Promise<Response> {
  const db = getDb(env);
  await db
    .delete(t.tags)
    .where(and(eq(t.tags.id, id), eq(t.tags.owner, owner)))
    .run();
  return jsonResponse({ ok: true });
}
