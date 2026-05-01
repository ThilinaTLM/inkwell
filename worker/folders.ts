// Folder CRUD + tree helpers.
//
// Every scene lives in exactly one folder. Each user has a single
// `is_default = 1` folder ("Inbox") that is auto-created on first
// authenticated request and refuses to rename/move/delete.
//
// Constraints enforced at the application layer:
//   * Folder name length 1..200 (also enforced by CHECK in schema).
//   * Max nesting depth: 8 (root = depth 1).
//   * Cycle prevention on move: target's ancestors must not include self.
//   * Cross-owner isolation: every query is `WHERE owner = ?`.
//
// Cleanup: when a folder is deleted, its direct children (scenes and
// subfolders) are moved up one level. The root case (deleting a folder
// at parent_id = NULL) moves children into the owner's Inbox.

import type { Env, FolderMeta, FolderRow, SceneRow } from "./types";
import { rowToFolderMeta } from "./types";
import { errorResponse, jsonResponse, newId, now } from "./util";
import { listTagsFor, replaceTagsFor } from "./tags";

export const MAX_DEPTH = 8;
const INBOX_NAME = "Inbox";

// ─── Inbox helper ──────────────────────────────────────────────────────
// Idempotent: returns the user's existing default folder or creates one.
// Also backfills any scene rows with NULL folder_id into the Inbox so a
// scene is never effectively folderless after migration.
export async function ensureInbox(env: Env, owner: string): Promise<FolderRow> {
  const existing = await env.DB.prepare(
    `SELECT id, owner, parent_id, name, is_default, created_at, updated_at
     FROM folders WHERE owner = ? AND is_default = 1`
  )
    .bind(owner)
    .first<FolderRow>();
  if (existing) {
    await env.DB.prepare(
      `UPDATE scenes SET folder_id = ? WHERE owner = ? AND folder_id IS NULL`
    )
      .bind(existing.id, owner)
      .run();
    return existing;
  }
  const id = newId();
  const t = now();
  await env.DB.prepare(
    `INSERT INTO folders (id, owner, parent_id, name, is_default, created_at, updated_at)
     VALUES (?, ?, NULL, ?, 1, ?, ?)`
  )
    .bind(id, owner, INBOX_NAME, t, t)
    .run();
  // Backfill any orphan scenes for this owner.
  await env.DB.prepare(
    `UPDATE scenes SET folder_id = ? WHERE owner = ? AND folder_id IS NULL`
  )
    .bind(id, owner)
    .run();
  return {
    id,
    owner,
    parent_id: null,
    name: INBOX_NAME,
    is_default: 1,
    created_at: t,
    updated_at: t,
  };
}

// ─── Internals ─────────────────────────────────────────────────────────
async function loadFolder(
  env: Env,
  owner: string,
  id: string
): Promise<FolderRow | null> {
  return await env.DB.prepare(
    `SELECT id, owner, parent_id, name, is_default, created_at, updated_at
     FROM folders WHERE id = ? AND owner = ?`
  )
    .bind(id, owner)
    .first<FolderRow>();
}

async function ancestorChain(
  env: Env,
  owner: string,
  startId: string
): Promise<string[]> {
  const { results } = await env.DB.prepare(
    `WITH RECURSIVE up(id, parent_id, depth) AS (
       SELECT id, parent_id, 1 FROM folders WHERE id = ?1 AND owner = ?2
       UNION ALL
       SELECT f.id, f.parent_id, up.depth + 1
       FROM folders f
       JOIN up ON f.id = up.parent_id
       WHERE f.owner = ?2 AND up.depth < 32
     )
     SELECT id FROM up`
  )
    .bind(startId, owner)
    .all<{ id: string }>();
  return (results || []).map((r) => r.id);
}

// "All folders inside this folder, including itself" — used for share
// authorization and scene listing recursion.
export async function descendantFolderIds(
  env: Env,
  owner: string,
  rootId: string
): Promise<string[]> {
  const { results } = await env.DB.prepare(
    `WITH RECURSIVE down(id) AS (
       SELECT id FROM folders WHERE id = ?1 AND owner = ?2
       UNION ALL
       SELECT f.id FROM folders f JOIN down ON f.parent_id = down.id
       WHERE f.owner = ?2
     )
     SELECT id FROM down`
  )
    .bind(rootId, owner)
    .all<{ id: string }>();
  return (results || []).map((r) => r.id);
}

// Returns the depth of the given folder (root = 1). Useful for "would the
// move make this exceed MAX_DEPTH?".
async function folderDepth(env: Env, owner: string, id: string): Promise<number> {
  const chain = await ancestorChain(env, owner, id);
  return chain.length;
}

// Maximum depth reachable from `rootId` going downward. Returns 0 if the
// root has no descendants beyond itself.
async function maxSubtreeDepth(
  env: Env,
  owner: string,
  rootId: string
): Promise<number> {
  const row = await env.DB.prepare(
    `WITH RECURSIVE down(id, depth) AS (
       SELECT id, 1 FROM folders WHERE id = ?1 AND owner = ?2
       UNION ALL
       SELECT f.id, down.depth + 1
       FROM folders f JOIN down ON f.parent_id = down.id
       WHERE f.owner = ?2
     )
     SELECT MAX(depth) AS d FROM down`
  )
    .bind(rootId, owner)
    .first<{ d: number | null }>();
  return row?.d ?? 1;
}

// ─── List ──────────────────────────────────────────────────────────────
// Returns flat list with counts and tags. The client builds the tree.
export async function listFolders(env: Env, owner: string): Promise<Response> {
  await ensureInbox(env, owner);

  const folderQuery = env.DB.prepare(
    `SELECT id, owner, parent_id, name, is_default, created_at, updated_at
     FROM folders WHERE owner = ?
     ORDER BY is_default DESC, name COLLATE NOCASE ASC`
  ).bind(owner);
  const sceneCountQuery = env.DB.prepare(
    `SELECT folder_id AS id, COUNT(*) AS n
     FROM scenes WHERE owner = ? AND folder_id IS NOT NULL
     GROUP BY folder_id`
  ).bind(owner);
  const subCountQuery = env.DB.prepare(
    `SELECT parent_id AS id, COUNT(*) AS n
     FROM folders WHERE owner = ? AND parent_id IS NOT NULL
     GROUP BY parent_id`
  ).bind(owner);
  const tagsQuery = env.DB.prepare(
    `SELECT t.target_id AS id, tg.name AS name
     FROM taggings t JOIN tags tg ON tg.id = t.tag_id
     WHERE t.owner = ? AND t.target_type = 'folder'
     ORDER BY tg.name COLLATE NOCASE`
  ).bind(owner);

  const [folders, sceneCounts, subCounts, tagRows] = await Promise.all([
    folderQuery.all<FolderRow>(),
    sceneCountQuery.all<{ id: string; n: number }>(),
    subCountQuery.all<{ id: string; n: number }>(),
    tagsQuery.all<{ id: string; name: string }>(),
  ]);

  const sceneMap = new Map((sceneCounts.results || []).map((r) => [r.id, r.n]));
  const subMap = new Map((subCounts.results || []).map((r) => [r.id, r.n]));
  const tagMap = new Map<string, string[]>();
  for (const t of tagRows.results || []) {
    const arr = tagMap.get(t.id);
    if (arr) arr.push(t.name);
    else tagMap.set(t.id, [t.name]);
  }

  const out: FolderMeta[] = (folders.results || []).map((f) =>
    rowToFolderMeta(f, {
      tags: tagMap.get(f.id) ?? [],
      sceneCount: sceneMap.get(f.id) ?? 0,
      subfolderCount: subMap.get(f.id) ?? 0,
    })
  );
  return jsonResponse({ folders: out });
}

// ─── Create ────────────────────────────────────────────────────────────
export async function createFolder(req: Request, env: Env, owner: string): Promise<Response> {
  await ensureInbox(env, owner);
  let body: { name?: string; parentId?: string | null; tags?: string[] };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return errorResponse(400, "invalid JSON");
  }
  const name = (body.name ?? "").trim().slice(0, 200);
  if (!name) return errorResponse(400, "name required");
  const parentId = body.parentId ?? null;
  if (parentId !== null) {
    const parent = await loadFolder(env, owner, parentId);
    if (!parent) return errorResponse(404, "parent folder not found");
    const depth = await folderDepth(env, owner, parentId);
    if (depth >= MAX_DEPTH) return errorResponse(400, `max nesting depth is ${MAX_DEPTH}`);
  }
  const id = newId();
  const t = now();
  await env.DB.prepare(
    `INSERT INTO folders (id, owner, parent_id, name, is_default, created_at, updated_at)
     VALUES (?, ?, ?, ?, 0, ?, ?)`
  )
    .bind(id, owner, parentId, name, t, t)
    .run();

  let tags: string[] = [];
  if (Array.isArray(body.tags)) {
    tags = await replaceTagsFor(env, owner, "folder", id, body.tags);
  }

  const row: FolderRow = {
    id,
    owner,
    parent_id: parentId,
    name,
    is_default: 0,
    created_at: t,
    updated_at: t,
  };
  return jsonResponse(rowToFolderMeta(row, { tags, sceneCount: 0, subfolderCount: 0 }));
}

// ─── Update (rename / move / retag) ───────────────────────────────────
export async function patchFolder(
  req: Request,
  env: Env,
  owner: string,
  id: string
): Promise<Response> {
  const folder = await loadFolder(env, owner, id);
  if (!folder) return errorResponse(404, "folder not found");

  let body: { name?: string; parentId?: string | null; tags?: string[] };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return errorResponse(400, "invalid JSON");
  }

  let nextName = folder.name;
  let nextParent: string | null = folder.parent_id;

  if (body.name !== undefined) {
    if (folder.is_default) return errorResponse(400, "cannot rename Inbox");
    const trimmed = body.name.trim().slice(0, 200);
    if (!trimmed) return errorResponse(400, "name required");
    nextName = trimmed;
  }

  if (body.parentId !== undefined && body.parentId !== folder.parent_id) {
    if (folder.is_default) return errorResponse(400, "cannot move Inbox");
    const newParent = body.parentId;
    if (newParent === id) return errorResponse(400, "cannot nest a folder under itself");
    if (newParent !== null) {
      const target = await loadFolder(env, owner, newParent);
      if (!target) return errorResponse(404, "parent folder not found");
      // Cycle check: target must not be a descendant of `id`.
      const descendants = await descendantFolderIds(env, owner, id);
      if (descendants.includes(newParent)) {
        return errorResponse(400, "cannot move a folder into its own descendant");
      }
      // Depth check: target depth + subtree depth must not exceed MAX_DEPTH.
      const targetDepth = await folderDepth(env, owner, newParent);
      const subtree = await maxSubtreeDepth(env, owner, id);
      if (targetDepth + subtree > MAX_DEPTH) {
        return errorResponse(400, `max nesting depth is ${MAX_DEPTH}`);
      }
    }
    nextParent = newParent;
  }

  const t = now();
  await env.DB.prepare(
    `UPDATE folders SET name = ?, parent_id = ?, updated_at = ? WHERE id = ? AND owner = ?`
  )
    .bind(nextName, nextParent, t, id, owner)
    .run();

  let tags = await listTagsFor(env, "folder", id);
  if (Array.isArray(body.tags)) {
    if (folder.is_default) {
      // Allow tagging the Inbox.
      tags = await replaceTagsFor(env, owner, "folder", id, body.tags);
    } else {
      tags = await replaceTagsFor(env, owner, "folder", id, body.tags);
    }
  }

  const sceneCount = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM scenes WHERE owner = ? AND folder_id = ?`
  )
    .bind(owner, id)
    .first<{ n: number }>();
  const subCount = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM folders WHERE owner = ? AND parent_id = ?`
  )
    .bind(owner, id)
    .first<{ n: number }>();

  const updated: FolderRow = {
    ...folder,
    name: nextName,
    parent_id: nextParent,
    updated_at: t,
  };
  return jsonResponse(
    rowToFolderMeta(updated, {
      tags,
      sceneCount: sceneCount?.n ?? 0,
      subfolderCount: subCount?.n ?? 0,
    })
  );
}

// ─── Delete ────────────────────────────────────────────────────────────
// Children (scenes + subfolders) move up one level. Inbox cannot be
// deleted; if the deleted folder is at root, children move into Inbox.
export async function deleteFolder(env: Env, owner: string, id: string): Promise<Response> {
  const folder = await loadFolder(env, owner, id);
  if (!folder) return errorResponse(404, "folder not found");
  if (folder.is_default) return errorResponse(400, "cannot delete Inbox");

  const targetParent = folder.parent_id ?? (await ensureInbox(env, owner)).id;
  const t = now();
  // Move direct subfolders up.
  await env.DB.prepare(
    `UPDATE folders SET parent_id = ?, updated_at = ? WHERE owner = ? AND parent_id = ?`
  )
    .bind(folder.parent_id, t, owner, id)
    .run();
  // Move direct scenes up (root-deletions land in Inbox, hence targetParent).
  await env.DB.prepare(
    `UPDATE scenes SET folder_id = ?, updated_at = ? WHERE owner = ? AND folder_id = ?`
  )
    .bind(folder.parent_id ?? targetParent, t, owner, id)
    .run();
  // Remove taggings for this folder, then the folder itself.
  await env.DB.prepare(
    `DELETE FROM taggings WHERE target_type = 'folder' AND target_id = ? AND owner = ?`
  )
    .bind(id, owner)
    .run();
  // Revoke any shares targeting this folder.
  await env.DB.prepare(
    `DELETE FROM shares WHERE target_type = 'folder' AND target_id = ? AND owner = ?`
  )
    .bind(id, owner)
    .run();
  await env.DB.prepare(`DELETE FROM folders WHERE id = ? AND owner = ?`).bind(id, owner).run();
  return jsonResponse({ ok: true });
}

// ─── Helpers used by share authorization ───────────────────────────────
// Returns true if the scene is inside the given folder's subtree.
export async function sceneInFolderSubtree(
  env: Env,
  owner: string,
  sceneId: string,
  folderId: string
): Promise<boolean> {
  const scene = await env.DB.prepare(
    `SELECT folder_id FROM scenes WHERE id = ? AND owner = ?`
  )
    .bind(sceneId, owner)
    .first<{ folder_id: string | null }>();
  if (!scene || !scene.folder_id) return false;
  if (scene.folder_id === folderId) return true;
  // Walk up from scene.folder_id looking for folderId.
  const chain = await ancestorChain(env, owner, scene.folder_id);
  return chain.includes(folderId);
}

// Returns true if `childFolderId` is the same as or under `rootFolderId`.
export async function folderInSubtree(
  env: Env,
  owner: string,
  childFolderId: string,
  rootFolderId: string
): Promise<boolean> {
  if (childFolderId === rootFolderId) return true;
  const chain = await ancestorChain(env, owner, childFolderId);
  return chain.includes(rootFolderId);
}

// Returns the list of (id, name, parent_id) for every scene-bearing
// folder in a subtree, used by the public folder-share listing.
export async function listSubtreeFolders(
  env: Env,
  owner: string,
  rootId: string
): Promise<FolderRow[]> {
  const { results } = await env.DB.prepare(
    `WITH RECURSIVE down(id) AS (
       SELECT id FROM folders WHERE id = ?1 AND owner = ?2
       UNION ALL
       SELECT f.id FROM folders f JOIN down ON f.parent_id = down.id
       WHERE f.owner = ?2
     )
     SELECT f.id, f.owner, f.parent_id, f.name, f.is_default, f.created_at, f.updated_at
     FROM folders f WHERE f.id IN (SELECT id FROM down)
     ORDER BY f.name COLLATE NOCASE`
  )
    .bind(rootId, owner)
    .all<FolderRow>();
  return results || [];
}

// Loads scenes filtered by an explicit list of folder ids. Used both for
// recursive owner listings and folder-share public listings.
export async function loadScenesInFolders(
  env: Env,
  owner: string,
  folderIds: string[]
): Promise<SceneRow[]> {
  if (folderIds.length === 0) return [];
  const placeholders = folderIds.map(() => "?").join(",");
  const { results } = await env.DB.prepare(
    `SELECT id, owner, folder_id, name, version, size_bytes, has_thumb, created_at, updated_at
     FROM scenes
     WHERE owner = ? AND folder_id IN (${placeholders})
     ORDER BY updated_at DESC LIMIT 1000`
  )
    .bind(owner, ...folderIds)
    .all<SceneRow>();
  return results || [];
}
