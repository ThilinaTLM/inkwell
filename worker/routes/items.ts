// Bulk item routes mounted at `/api/items`.
//
// Every endpoint takes `{ items: ItemRef[] }` (files and folders mixed),
// at most `MAX_BULK_ITEMS` refs (413 above that). Shared rules:
//   * Every ref must be owned by the caller — one unknown ref 404s the
//     whole request, and nothing is written.
//   * State is checked per endpoint: move/trash/star/duplicate require
//     live items, restore requires top-level Trash rows, purge requires
//     trashed rows. A ref in the wrong state is a 404 (from the caller's
//     point of view the item isn't where they think it is).
//   * move/trash/duplicate drop refs whose ancestor folder is also in the
//     batch — acting on the folder already covers them.
//   * Writes run as a single `db.batch` (one D1 transaction).

import { and, eq, isNull } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { getDb, t } from "../db/client";
import { inIds } from "../db/filters";
import * as foldersRepo from "../db/repos/folders";
import { MAX_DEPTH } from "../db/repos/folders";
import { checkFolderMove, dedupeByAncestor, type ItemRef, MAX_BULK_ITEMS } from "../lib/items";
import { errorResponse, jsonResponse } from "../lib/responses";
import { now } from "../lib/util";
import { requireSession } from "../middleware/auth";
import type { AppEnv } from "../middleware/types";
import { DuplicateError, duplicateItems } from "../services/duplicate";
import { purgeItems, restoreItems, trashItems } from "../services/trash";
import type { Env, FileRow, FolderRow, MovePreviousPublic } from "../types";

const r = new Hono<AppEnv>();

r.use("*", requireSession);

// ─── Body parsing ────────────────────────────────────────────────────
const itemRef = z.object({
  type: z.enum(["file", "folder"]),
  id: z.string().min(1).max(64),
});
const itemsBody = z.object({ items: z.array(itemRef).min(1) });
const folderTarget = z.string().min(1).max(64).nullable();

/** Parse + validate the body. The size cap is checked before the schema
 *  so an oversized batch is a clear 413 rather than a generic 400. */
async function parseBody<S extends z.ZodType>(
  req: Request,
  schema: S,
): Promise<z.infer<S> | Response> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return errorResponse(400, "invalid JSON");
  }
  const items = (raw as { items?: unknown } | null)?.items;
  if (Array.isArray(items) && items.length > MAX_BULK_ITEMS) {
    return errorResponse(413, `at most ${MAX_BULK_ITEMS} items per request`);
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const where = issue?.path.length ? `${issue.path.join(".")}: ` : "";
    return errorResponse(400, `invalid body: ${where}${issue?.message ?? "invalid"}`);
  }
  return parsed.data;
}

// ─── Ref resolution ──────────────────────────────────────────────────
interface Resolved {
  files: Map<string, FileRow>;
  folders: Map<string, FolderRow>;
}

type RefState = "live" | "trashed" | "trash-top";

// Load every referenced row owned by `owner` (trashed included) and
// check each is in `state`. Returns a 404 Response if any ref is missing,
// foreign, or in the wrong state.
async function resolveRefs(
  env: Env,
  owner: string,
  refs: readonly ItemRef[],
  state: RefState,
): Promise<Resolved | Response> {
  const db = getDb(env);
  const fileIds = refs.filter((x) => x.type === "file").map((x) => x.id);
  const folderIds = refs.filter((x) => x.type === "folder").map((x) => x.id);
  const [fileRows, folderRows] = await Promise.all([
    fileIds.length > 0
      ? db
          .select()
          .from(t.files)
          .where(and(eq(t.files.owner, owner), inIds(t.files.id, fileIds)))
          .all()
      : Promise.resolve([] as FileRow[]),
    folderIds.length > 0
      ? db
          .select()
          .from(t.folders)
          .where(and(eq(t.folders.owner, owner), inIds(t.folders.id, folderIds)))
          .all()
      : Promise.resolve([] as FolderRow[]),
  ]);
  const files = new Map(fileRows.map((x) => [x.id, x]));
  const folders = new Map(folderRows.map((x) => [x.id, x]));
  const ok = (row: { deleted_at: number | null; trashed_via: string | null } | undefined) => {
    if (!row) return false;
    if (state === "live") return row.deleted_at === null;
    if (state === "trashed") return row.deleted_at !== null;
    return row.deleted_at !== null && row.trashed_via === null;
  };
  for (const ref of refs) {
    const row = ref.type === "file" ? files.get(ref.id) : folders.get(ref.id);
    if (!ok(row)) {
      return errorResponse(404, `${ref.type} not found: ${ref.id}`);
    }
  }
  return { files, folders };
}

async function dedupe(
  env: Env,
  owner: string,
  refs: readonly ItemRef[],
  resolved: Resolved,
  parentOf?: Map<string, string | null>,
): Promise<ItemRef[]> {
  const parents = parentOf ?? (await foldersRepo.liveParentMap(env, owner));
  const fileFolder = new Map([...resolved.files.values()].map((f) => [f.id, f.folder_id]));
  return dedupeByAncestor(refs, parents, fileFolder);
}

// Target folder must be a live folder of the caller (`null` = root).
async function checkTarget(env: Env, owner: string, target: string | null): Promise<boolean> {
  return target === null || (await foldersRepo.existsForOwner(env, owner, target));
}

// ─── POST /api/items/move ────────────────────────────────────────────
const moveBody = itemsBody.extend({ targetFolderId: folderTarget });

r.post("/move", async (c) => {
  const owner = c.get("session").userId;
  const body = await parseBody(c.req.raw, moveBody);
  if (body instanceof Response) return body;
  const target = body.targetFolderId;

  const resolved = await resolveRefs(c.env, owner, body.items, "live");
  if (resolved instanceof Response) return resolved;
  if (!(await checkTarget(c.env, owner, target))) {
    return errorResponse(404, "target folder not found");
  }

  const parentOf = await foldersRepo.liveParentMap(c.env, owner);
  const refs = await dedupe(c.env, owner, body.items, resolved, parentOf);

  // Same cycle/depth rules as `PATCH /api/folders/:id`; a cycle is a
  // conflict with the current tree, hence 409 here.
  for (const ref of refs) {
    if (ref.type !== "folder") continue;
    const problem = checkFolderMove(parentOf, ref.id, target, MAX_DEPTH);
    if (problem === "cycle") {
      return errorResponse(409, "cannot move a folder into itself or its own subfolder");
    }
    if (problem === "depth") return errorResponse(400, `max nesting depth is ${MAX_DEPTH}`);
  }

  const previous: MovePreviousPublic[] = refs.map((ref) => ({
    type: ref.type,
    id: ref.id,
    parentId:
      ref.type === "file"
        ? (resolved.files.get(ref.id)?.folder_id ?? null)
        : (resolved.folders.get(ref.id)?.parent_id ?? null),
  }));

  const fileIds = refs.filter((x) => x.type === "file").map((x) => x.id);
  const folderIds = refs.filter((x) => x.type === "folder").map((x) => x.id);
  const ts = now();
  const db = getDb(c.env);
  await db.batch([
    db
      .update(t.files)
      .set({ folder_id: target, updated_at: ts })
      .where(and(eq(t.files.owner, owner), isNull(t.files.deleted_at), inIds(t.files.id, fileIds))),
    db
      .update(t.folders)
      .set({ parent_id: target, updated_at: ts })
      .where(
        and(
          eq(t.folders.owner, owner),
          isNull(t.folders.deleted_at),
          inIds(t.folders.id, folderIds),
        ),
      ),
  ]);
  return jsonResponse({ previous });
});

// ─── POST /api/items/trash ───────────────────────────────────────────
r.post("/trash", async (c) => {
  const owner = c.get("session").userId;
  const body = await parseBody(c.req.raw, itemsBody);
  if (body instanceof Response) return body;
  const resolved = await resolveRefs(c.env, owner, body.items, "live");
  if (resolved instanceof Response) return resolved;
  const refs = await dedupe(c.env, owner, body.items, resolved);
  await trashItems(c.env, owner, refs);
  // Only the top-level refs: restoring them brings the rest back, which
  // is exactly what the client's undo needs.
  return jsonResponse({ trashed: refs });
});

// ─── POST /api/items/restore ─────────────────────────────────────────
r.post("/restore", async (c) => {
  const owner = c.get("session").userId;
  const body = await parseBody(c.req.raw, itemsBody);
  if (body instanceof Response) return body;
  const resolved = await resolveRefs(c.env, owner, body.items, "trash-top");
  if (resolved instanceof Response) return resolved;
  const refs = uniqueRefs(body.items);
  const parents = new Map<string, string | null>();
  for (const ref of refs) {
    parents.set(
      ref.id,
      ref.type === "file"
        ? (resolved.files.get(ref.id)?.folder_id ?? null)
        : (resolved.folders.get(ref.id)?.parent_id ?? null),
    );
  }
  const restored = await restoreItems(c.env, owner, refs, parents);
  return jsonResponse({ restored });
});

// ─── POST /api/items/purge ───────────────────────────────────────────
r.post("/purge", async (c) => {
  const owner = c.get("session").userId;
  const body = await parseBody(c.req.raw, itemsBody);
  if (body instanceof Response) return body;
  const resolved = await resolveRefs(c.env, owner, body.items, "trashed");
  if (resolved instanceof Response) return resolved;
  await purgeItems(c.env, owner, uniqueRefs(body.items));
  return jsonResponse({ ok: true });
});

// ─── POST /api/items/star ────────────────────────────────────────────
const starBody = itemsBody.extend({ starred: z.boolean() });

r.post("/star", async (c) => {
  const owner = c.get("session").userId;
  const body = await parseBody(c.req.raw, starBody);
  if (body instanceof Response) return body;
  const resolved = await resolveRefs(c.env, owner, body.items, "live");
  if (resolved instanceof Response) return resolved;

  const fileIds = body.items.filter((x) => x.type === "file").map((x) => x.id);
  const folderIds = body.items.filter((x) => x.type === "folder").map((x) => x.id);
  const db = getDb(c.env);
  if (body.starred) {
    // Already-starred items keep their original `starred_at`, so
    // re-starring doesn't reshuffle the Starred list.
    const ts = now();
    await db.batch([
      db
        .update(t.files)
        .set({ starred_at: ts })
        .where(
          and(eq(t.files.owner, owner), isNull(t.files.starred_at), inIds(t.files.id, fileIds)),
        ),
      db
        .update(t.folders)
        .set({ starred_at: ts })
        .where(
          and(
            eq(t.folders.owner, owner),
            isNull(t.folders.starred_at),
            inIds(t.folders.id, folderIds),
          ),
        ),
    ]);
  } else {
    await db.batch([
      db
        .update(t.files)
        .set({ starred_at: null })
        .where(and(eq(t.files.owner, owner), inIds(t.files.id, fileIds))),
      db
        .update(t.folders)
        .set({ starred_at: null })
        .where(and(eq(t.folders.owner, owner), inIds(t.folders.id, folderIds))),
    ]);
  }
  return jsonResponse({ ok: true });
});

// ─── POST /api/items/duplicate ───────────────────────────────────────
// `targetFolderId` omitted → next to each original; `null` → root.
const duplicateBody = itemsBody.extend({ targetFolderId: folderTarget.optional() });

r.post("/duplicate", async (c) => {
  const owner = c.get("session").userId;
  const body = await parseBody(c.req.raw, duplicateBody);
  if (body instanceof Response) return body;
  const resolved = await resolveRefs(c.env, owner, body.items, "live");
  if (resolved instanceof Response) return resolved;
  const target = body.targetFolderId;
  if (target !== undefined && !(await checkTarget(c.env, owner, target))) {
    return errorResponse(404, "target folder not found");
  }
  const refs = await dedupe(c.env, owner, body.items, resolved);
  try {
    const result = await duplicateItems(c.env, owner, refs, resolved.files, target);
    return jsonResponse(result);
  } catch (e) {
    if (e instanceof DuplicateError) return errorResponse(e.status, e.message);
    throw e;
  }
});

function uniqueRefs(refs: readonly ItemRef[]): ItemRef[] {
  const seen = new Set<string>();
  return refs.filter((x) => {
    const key = `${x.type}:${x.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export default r;
