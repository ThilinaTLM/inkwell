// Shared Worker types. Mirrors the bindings declared in wrangler.toml.
//
// Row types are inferred from the Drizzle schema in `worker/db/schema.ts`
// and re-exported here so handlers don't have to import from two places.
// Public ("wire") shapes and `rowTo*Public` mappers stay hand-written —
// they are the JSON contract with the SPA and changing them must be a
// deliberate act.

import type { InferSelectModel } from "drizzle-orm";
import type * as t from "./db/schema";

export interface Env {
  ASSETS: Fetcher;
  R2: R2Bucket;
  DB: D1Database;
  // Secrets — set via `wrangler secret put`.
  SUPER_ADMIN_EMAIL: string;
  SUPER_ADMIN_PASSWORD: string;
  SESSION_SECRET: string;
  // Vars
  ALLOWED_ORIGINS?: string;
}

// ─── Users ────────────────────────────────────────────────────────────
export type UserRow = InferSelectModel<typeof t.users>;

// What we hand to clients. Never includes the password hash.
export interface UserPublic {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  isAdmin: boolean;
  disabled: boolean;
  createdAt: number;
  updatedAt: number;
  lastLoginAt: number | null;
}

export function rowToUserPublic(r: UserRow): UserPublic {
  return {
    id: r.id,
    email: r.email,
    firstName: r.first_name,
    lastName: r.last_name,
    isAdmin: r.is_admin,
    disabled: r.disabled,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    lastLoginAt: r.last_login_at,
  };
}

// Admin-list rows include an aggregated scene count.
export type AdminUserRow = UserRow & { scene_count: number };

export interface AdminUserPublic extends UserPublic {
  sceneCount: number;
}

export function rowToAdminUserPublic(r: AdminUserRow): AdminUserPublic {
  return {
    ...rowToUserPublic(r),
    sceneCount: r.scene_count,
  };
}

// ─── Invites ──────────────────────────────────────────────────────────
export type InviteRow = InferSelectModel<typeof t.invites>;

export type InviteStatus = "pending" | "used" | "revoked" | "expired";

export interface InvitePublic {
  token: string;
  status: InviteStatus;
  createdBy: string; // user id of creator
  createdByEmail?: string; // joined for admin listing
  createdAt: number;
  expiresAt: number | null;
  usedByUserId: string | null;
  usedByEmail?: string | null; // joined for admin listing
  usedAt: number | null;
  revokedAt: number | null;
}

export function inviteStatus(r: InviteRow, nowMs: number): InviteStatus {
  if (r.revoked_at) return "revoked";
  if (r.used_at) return "used";
  if (r.expires_at !== null && r.expires_at <= nowMs) return "expired";
  return "pending";
}

// Row shape returned by the admin listing JOIN. Fields suffixed `_email`
// come from joined `users` rows (creator and user-who-used).
export type InviteAdminRow = InviteRow & {
  created_by_email: string | null;
  used_by_email: string | null;
};

export function rowToInvitePublic(r: InviteRow | InviteAdminRow, nowMs: number): InvitePublic {
  const out: InvitePublic = {
    token: r.token,
    status: inviteStatus(r, nowMs),
    createdBy: r.created_by,
    createdAt: r.created_at,
    expiresAt: r.expires_at,
    usedByUserId: r.used_by_user_id,
    usedAt: r.used_at,
    revokedAt: r.revoked_at,
  };
  if ("created_by_email" in r) {
    out.createdByEmail = r.created_by_email ?? undefined;
    out.usedByEmail = r.used_by_email;
  }
  return out;
}

// ─── Folders ──────────────────────────────────────────────────────────
export type FolderRow = InferSelectModel<typeof t.folders>;

// Compact preview info for a single scene inside a folder. Used by
// `FolderCard` to render thumbnails between the folds. Carries only
// what the card needs — not the full SceneMeta.
export interface ScenePreview {
  id: string;
  hasThumb: boolean;
  thumbUpdatedAt: number;
}

export interface FolderMeta {
  id: string;
  parentId: string | null;
  name: string;
  tags: string[];
  sceneCount: number; // direct children only
  subfolderCount: number; // direct children only
  /** Up to 2 most-recently-updated scenes inside this folder, newest first. */
  previews: ScenePreview[];
  createdAt: number;
  updatedAt: number;
}

export function rowToFolderMeta(
  r: FolderRow,
  extras: {
    tags?: string[];
    sceneCount?: number;
    subfolderCount?: number;
    previews?: ScenePreview[];
  } = {},
): FolderMeta {
  return {
    id: r.id,
    parentId: r.parent_id,
    name: r.name,
    tags: extras.tags ?? [],
    sceneCount: extras.sceneCount ?? 0,
    subfolderCount: extras.subfolderCount ?? 0,
    previews: extras.previews ?? [],
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

// ─── Scenes ───────────────────────────────────────────────────────────
export type SceneRow = InferSelectModel<typeof t.scenes>;

// API-facing metadata (omits internal fields). `folderId` is `null` when
// the scene lives at the root level (no parent folder).
export interface SceneMeta {
  id: string;
  folderId: string | null;
  name: string;
  tags: string[];
  version: number;
  sizeBytes: number;
  hasThumb: boolean;
  /** Cache-bust token for `/api/scenes/:id/thumb`. Bumped to `now()` on
   *  every successful thumb upload; `0` means no thumb yet. */
  thumbUpdatedAt: number;
  createdAt: number;
  updatedAt: number;
}

export function rowToMeta(r: SceneRow, tags: string[] = []): SceneMeta {
  return {
    id: r.id,
    folderId: r.folder_id ?? null,
    name: r.name,
    tags,
    version: r.version,
    sizeBytes: r.size_bytes,
    hasThumb: r.has_thumb,
    thumbUpdatedAt: r.thumb_updated_at,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

// ─── Tags ─────────────────────────────────────────────────────────────
export type TagRow = InferSelectModel<typeof t.tags>;

export interface TagPublic {
  id: string;
  name: string;
  sceneCount: number;
  folderCount: number;
}

export type TagTargetType = "scene" | "folder";

export type TaggingRow = InferSelectModel<typeof t.taggings>;

// What the client PUTs as a scene blob. We don't validate the inner shape
// of `elements` / `appState` / `files` — Excalidraw owns that schema and
// it changes between versions. We just round-trip the JSON.
export interface SceneBlob {
  elements: unknown[];
  appState?: Record<string, unknown>;
  files?: Record<string, unknown>;
}

// ─── Shares (polymorphic) ────────────────────────────────────────────
export type SharePermission = "read" | "write";
export type ShareTargetType = "scene" | "folder";

export type ShareRow = InferSelectModel<typeof t.shares>;

export interface SharePublic {
  token: string;
  targetType: ShareTargetType;
  targetId: string;
  targetName?: string; // joined for listing
  permission: SharePermission;
  allowDownload: boolean;
  label: string | null;
  createdAt: number;
  expiresAt: number | null;
  lastAccessedAt: number | null;
}

export function rowToSharePublic(r: ShareRow, targetName?: string): SharePublic {
  return {
    token: r.token,
    targetType: r.target_type,
    targetId: r.target_id,
    targetName,
    permission: r.permission,
    allowDownload: r.allow_download,
    label: r.label,
    createdAt: r.created_at,
    expiresAt: r.expires_at,
    lastAccessedAt: r.last_accessed_at,
  };
}

export function isShareActive(r: ShareRow, nowMs: number): boolean {
  if (r.revoked_at) return false;
  if (r.expires_at !== null && r.expires_at <= nowMs) return false;
  return true;
}
