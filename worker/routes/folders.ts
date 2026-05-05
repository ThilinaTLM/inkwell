// Owner-side folder routes mounted at `/api/folders`.
//
// Folder shares (`/api/folders/:id/shares`) are mounted from the shares
// route module — see `worker/routes/shares.ts`.

import { Hono } from "hono";
import * as foldersRepo from "../db/repos/folders";
import { MAX_DEPTH } from "../db/repos/folders";
import * as sharesRepo from "../db/repos/shares";
import * as tagsRepo from "../db/repos/tags";
import { newId } from "../lib/crypto";
import { errorResponse, jsonResponse } from "../lib/responses";
import { now } from "../lib/util";
import { requireSession } from "../middleware/auth";
import { parseJson } from "../middleware/body";
import type { AppEnv } from "../middleware/types";
import { deleteFolderCascade } from "../services/delete-cascade";
import type { FolderMeta, FolderRow } from "../types";
import { rowToFolderMeta } from "../types";

const r = new Hono<AppEnv>();

r.use("*", requireSession);

// ─── List ────────────────────────────────────────────────────────────
r.get("/", async (c) => {
  const owner = c.get("session").userId;
  const folderRows = await foldersRepo.listForOwner(c.env, owner);
  const aggregates = await foldersRepo.loadListAggregates(c.env, owner);
  const shareMap = await sharesRepo.countActiveByTarget(
    c.env,
    owner,
    "folder",
    folderRows.map((f) => f.id),
  );

  const out: FolderMeta[] = folderRows.map((f) =>
    rowToFolderMeta(f, {
      tags: aggregates.tagsByFolder.get(f.id) ?? [],
      fileCount: aggregates.fileCounts.get(f.id) ?? 0,
      subfolderCount: aggregates.subfolderCounts.get(f.id) ?? 0,
      previews: aggregates.previewsByFolder.get(f.id) ?? [],
      activeShareCount: shareMap.get(f.id) ?? 0,
    }),
  );
  return jsonResponse({ folders: out });
});

// ─── Create ──────────────────────────────────────────────────────────
interface CreateFolderBody {
  name?: string;
  parentId?: string | null;
  tags?: string[];
}

r.post("/", async (c) => {
  const owner = c.get("session").userId;
  const body = await parseJson<CreateFolderBody>(c);
  if (body instanceof Response) return body;

  const name = (body.name ?? "").trim().slice(0, 200);
  if (!name) return errorResponse(400, "name required");
  const parentId = body.parentId ?? null;
  if (parentId !== null) {
    const parent = await foldersRepo.findById(c.env, owner, parentId);
    if (!parent) return errorResponse(404, "parent folder not found");
    const depth = await foldersRepo.depthOf(c.env, owner, parentId);
    if (depth >= MAX_DEPTH) return errorResponse(400, `max nesting depth is ${MAX_DEPTH}`);
  }

  const id = newId();
  const ts = now();
  const row: FolderRow = {
    id,
    owner,
    parent_id: parentId,
    name,
    created_at: ts,
    updated_at: ts,
  };
  await foldersRepo.insert(c.env, row);

  const tags = Array.isArray(body.tags)
    ? await tagsRepo.replaceForEntity(c.env, owner, "folder", id, body.tags)
    : [];

  return jsonResponse(rowToFolderMeta(row, { tags, fileCount: 0, subfolderCount: 0 }));
});

// ─── Patch (rename / move / retag) ───────────────────────────────────
interface PatchFolderBody {
  name?: string;
  parentId?: string | null;
  tags?: string[];
}

r.patch("/:id", async (c) => {
  const owner = c.get("session").userId;
  const id = c.req.param("id");
  const folder = await foldersRepo.findById(c.env, owner, id);
  if (!folder) return errorResponse(404, "folder not found");

  const body = await parseJson<PatchFolderBody>(c);
  if (body instanceof Response) return body;

  let nextName = folder.name;
  let nextParent: string | null = folder.parent_id;

  if (body.name !== undefined) {
    const trimmed = body.name.trim().slice(0, 200);
    if (!trimmed) return errorResponse(400, "name required");
    nextName = trimmed;
  }

  if (body.parentId !== undefined && body.parentId !== folder.parent_id) {
    const newParent = body.parentId;
    if (newParent === id) return errorResponse(400, "cannot nest a folder under itself");
    if (newParent !== null) {
      const target = await foldersRepo.findById(c.env, owner, newParent);
      if (!target) return errorResponse(404, "parent folder not found");
      // Cycle check.
      const descendants = await foldersRepo.descendantIds(c.env, owner, id);
      if (descendants.includes(newParent)) {
        return errorResponse(400, "cannot move a folder into its own descendant");
      }
      // Depth check.
      const targetDepth = await foldersRepo.depthOf(c.env, owner, newParent);
      const subtree = await foldersRepo.maxSubtreeDepth(c.env, owner, id);
      if (targetDepth + subtree > MAX_DEPTH) {
        return errorResponse(400, `max nesting depth is ${MAX_DEPTH}`);
      }
    }
    nextParent = newParent;
  }

  const ts = now();
  await foldersRepo.update(c.env, owner, id, {
    name: nextName,
    parent_id: nextParent,
    updated_at: ts,
  });

  let tags = await tagsRepo.listForEntity(c.env, "folder", id);
  if (Array.isArray(body.tags)) {
    tags = await tagsRepo.replaceForEntity(c.env, owner, "folder", id, body.tags);
  }

  const counts = await foldersRepo.childCounts(c.env, owner, id);
  const updated: FolderRow = {
    ...folder,
    name: nextName,
    parent_id: nextParent,
    updated_at: ts,
  };
  return jsonResponse(
    rowToFolderMeta(updated, {
      tags,
      fileCount: counts.fileCount,
      subfolderCount: counts.subfolderCount,
    }),
  );
});

// ─── Delete ──────────────────────────────────────────────────────────
r.delete("/:id", async (c) => {
  const owner = c.get("session").userId;
  const id = c.req.param("id");
  const folder = await foldersRepo.findById(c.env, owner, id);
  if (!folder) return errorResponse(404, "folder not found");
  await deleteFolderCascade(c.env, owner, folder);
  return jsonResponse({ ok: true });
});

export default r;
