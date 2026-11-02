// Project metadata carried by folders (migration 0004).
//
// The icon/colour vocabularies are curated: the frontend owns the mapping
// from key → Hugeicon / colour classes, the worker only guarantees that a
// stored key is one of the known ones. Keep these lists in sync with
// `src/lib/api/client.ts` (FOLDER_ICONS / FOLDER_COLORS).

import { z } from "zod";

export const FOLDER_ICONS = [
  "folder",
  "rocket",
  "book",
  "flask",
  "chart",
  "code",
  "presentation",
  "star",
  "briefcase",
  "palette",
  "server",
  "globe",
] as const;

export const FOLDER_COLORS = [
  "orange",
  "amber",
  "green",
  "teal",
  "blue",
  "indigo",
  "violet",
  "rose",
  "slate",
] as const;

export const FOLDER_STATUSES = ["active", "paused", "done"] as const;
export const MAX_FOLDER_DESCRIPTION = 280;

/** Metadata fields accepted on `POST /api/folders` and `PATCH /api/folders/:id`.
 *  Every field is optional; `null` clears it. */
export const folderMetaSchema = z.object({
  icon: z.enum(FOLDER_ICONS).nullable().optional(),
  color: z.enum(FOLDER_COLORS).nullable().optional(),
  description: z.string().max(MAX_FOLDER_DESCRIPTION).nullable().optional(),
  status: z.enum(FOLDER_STATUSES).nullable().optional(),
  pinnedAt: z.number().int().positive().nullable().optional(),
});

export type FolderMetaInput = z.infer<typeof folderMetaSchema>;

/** Column patch derived from validated input (only keys that were sent). */
export interface FolderMetaColumns {
  icon?: string | null;
  color?: string | null;
  description?: string | null;
  status?: (typeof FOLDER_STATUSES)[number] | null;
  pinned_at?: number | null;
}

/** Validate the metadata subset of a request body. Returns the column
 *  patch, or an error message suitable for a 400. Blank descriptions are
 *  stored as NULL. */
export function parseFolderMeta(body: unknown): FolderMetaColumns | string {
  const src = (typeof body === "object" && body !== null ? body : {}) as Record<string, unknown>;
  const parsed = folderMetaSchema.safeParse({
    icon: src.icon,
    color: src.color,
    description: src.description,
    status: src.status,
    pinnedAt: src.pinnedAt,
  });
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return `invalid ${String(issue?.path[0] ?? "folder metadata")}`;
  }
  const v = parsed.data;
  const out: FolderMetaColumns = {};
  if (v.icon !== undefined) out.icon = v.icon;
  if (v.color !== undefined) out.color = v.color;
  if (v.description !== undefined) out.description = v.description?.trim() || null;
  if (v.status !== undefined) out.status = v.status;
  if (v.pinnedAt !== undefined) out.pinned_at = v.pinnedAt;
  return out;
}
