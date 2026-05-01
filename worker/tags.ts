// Tag CRUD helpers.
//
// A tag has per-user identity: `tags(id, owner, name)` with a unique
// `(owner, name)` index. `name` is normalized as `trim().toLowerCase()`
// and capped at 50 characters. Tags attach to scenes or folders via the
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

import type { Env, TagPublic, TagRow, TagTargetType } from "./types";
import { errorResponse, jsonResponse, newId, now } from "./util";

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
  const { results } = await env.DB.prepare(
    `SELECT
        t.id   AS id,
        t.name AS name,
        SUM(CASE WHEN g.target_type = 'scene'  THEN 1 ELSE 0 END) AS scene_count,
        SUM(CASE WHEN g.target_type = 'folder' THEN 1 ELSE 0 END) AS folder_count
     FROM tags t
     LEFT JOIN taggings g ON g.tag_id = t.id
     WHERE t.owner = ?
     GROUP BY t.id
     ORDER BY t.name COLLATE NOCASE ASC`
  )
    .bind(owner)
    .all<{ id: string; name: string; scene_count: number; folder_count: number }>();
  const tags: TagPublic[] = (results || []).map((r) => ({
    id: r.id,
    name: r.name,
    sceneCount: r.scene_count ?? 0,
    folderCount: r.folder_count ?? 0,
  }));
  return jsonResponse({ tags });
}

export async function listTagsFor(
  env: Env,
  targetType: TagTargetType,
  targetId: string
): Promise<string[]> {
  const { results } = await env.DB.prepare(
    `SELECT t.name AS name
     FROM taggings g JOIN tags t ON t.id = g.tag_id
     WHERE g.target_type = ? AND g.target_id = ?
     ORDER BY t.name COLLATE NOCASE`
  )
    .bind(targetType, targetId)
    .all<{ name: string }>();
  return (results || []).map((r) => r.name);
}

// Batch loader: returns a Map<targetId, string[]> for the given ids.
export async function collectTagsForMany(
  env: Env,
  targetType: TagTargetType,
  targetIds: string[]
): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  if (targetIds.length === 0) return out;
  const placeholders = targetIds.map(() => "?").join(",");
  const { results } = await env.DB.prepare(
    `SELECT g.target_id AS id, t.name AS name
     FROM taggings g JOIN tags t ON t.id = g.tag_id
     WHERE g.target_type = ? AND g.target_id IN (${placeholders})
     ORDER BY t.name COLLATE NOCASE`
  )
    .bind(targetType, ...targetIds)
    .all<{ id: string; name: string }>();
  for (const r of results || []) {
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
  raw: unknown
): Promise<string[]> {
  const desired = normalizeTagSet(raw);
  // Look up existing tag rows for this owner that match any desired name.
  const t = now();
  const tagIds: string[] = [];
  for (const name of desired) {
    let row = await env.DB.prepare(`SELECT id FROM tags WHERE owner = ? AND name = ?`)
      .bind(owner, name)
      .first<{ id: string }>();
    if (!row) {
      const id = newId();
      await env.DB.prepare(
        `INSERT INTO tags (id, owner, name, created_at) VALUES (?, ?, ?, ?)`
      )
        .bind(id, owner, name, t)
        .run();
      row = { id };
    }
    tagIds.push(row.id);
  }
  // Replace the tagging set atomically-ish (D1 doesn't support multi-stmt
  // transactions, so do it as delete-then-insert).
  await env.DB.prepare(
    `DELETE FROM taggings WHERE target_type = ? AND target_id = ?`
  )
    .bind(targetType, targetId)
    .run();
  for (const tagId of tagIds) {
    await env.DB.prepare(
      `INSERT OR IGNORE INTO taggings (tag_id, target_type, target_id, owner, created_at)
       VALUES (?, ?, ?, ?, ?)`
    )
      .bind(tagId, targetType, targetId, owner, t)
      .run();
  }
  // Garbage-collect tags that no longer have any taggings (keeps the
  // sidebar list clean). Cheap because the index covers it.
  await env.DB.prepare(
    `DELETE FROM tags
     WHERE owner = ?
       AND id NOT IN (SELECT DISTINCT tag_id FROM taggings WHERE owner = ?)`
  )
    .bind(owner, owner)
    .run();
  return desired;
}

// PATCH /api/tags/:id — rename a tag everywhere.
export async function renameTag(
  req: Request,
  env: Env,
  owner: string,
  id: string
): Promise<Response> {
  const tag = await env.DB.prepare(
    `SELECT id, owner, name, created_at FROM tags WHERE id = ? AND owner = ?`
  )
    .bind(id, owner)
    .first<TagRow>();
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
  const existing = await env.DB.prepare(
    `SELECT id FROM tags WHERE owner = ? AND name = ?`
  )
    .bind(owner, next)
    .first<{ id: string }>();
  if (existing) {
    // Merge: rewrite taggings to point at the existing tag, dedupe.
    await env.DB.prepare(
      `INSERT OR IGNORE INTO taggings (tag_id, target_type, target_id, owner, created_at)
       SELECT ?, target_type, target_id, owner, created_at
       FROM taggings WHERE tag_id = ?`
    )
      .bind(existing.id, id)
      .run();
    await env.DB.prepare(`DELETE FROM tags WHERE id = ?`).bind(id).run();
    return jsonResponse({ id: existing.id, name: next });
  }
  await env.DB.prepare(`UPDATE tags SET name = ? WHERE id = ? AND owner = ?`)
    .bind(next, id, owner)
    .run();
  return jsonResponse({ id, name: next });
}

// DELETE /api/tags/:id — drop the tag (and its taggings via FK CASCADE).
export async function deleteTag(env: Env, owner: string, id: string): Promise<Response> {
  await env.DB.prepare(`DELETE FROM tags WHERE id = ? AND owner = ?`).bind(id, owner).run();
  return jsonResponse({ ok: true });
}
