// Tag management routes mounted at `/api/tags`.

import { Hono } from "hono";
import * as tagsRepo from "../db/repos/tags";
import { errorResponse, jsonResponse } from "../lib/responses";
import { requireSession } from "../middleware/auth";
import { parseJson } from "../middleware/body";
import type { AppEnv } from "../middleware/types";

const r = new Hono<AppEnv>();

r.use("*", requireSession);

r.get("/", async (c) => {
  const owner = c.get("session").userId;
  const tags = await tagsRepo.listForOwnerWithCounts(c.env, owner);
  return jsonResponse({ tags });
});

interface RenameTagBody {
  name?: string;
}

r.patch("/:id", async (c) => {
  const owner = c.get("session").userId;
  const id = c.req.param("id");
  const tag = await tagsRepo.findById(c.env, owner, id);
  if (!tag) return errorResponse(404, "tag not found");
  const body = await parseJson<RenameTagBody>(c);
  if (body instanceof Response) return body;
  const next = tagsRepo.normalizeTagName(body.name ?? "");
  if (!next) return errorResponse(400, "invalid tag name");
  const result = await tagsRepo.rename(c.env, owner, id, tag, next);
  return jsonResponse(result);
});

r.delete("/:id", async (c) => {
  const owner = c.get("session").userId;
  const id = c.req.param("id");
  await tagsRepo.remove(c.env, owner, id);
  return jsonResponse({ ok: true });
});

export default r;
