// Shared Worker types. Mirrors the bindings declared in wrangler.toml.

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
export interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  first_name: string;
  last_name: string;
  is_admin: number;            // 0 | 1
  disabled: number;            // 0 | 1
  created_at: number;
  updated_at: number;
  last_login_at: number | null;
}

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
    isAdmin: !!r.is_admin,
    disabled: !!r.disabled,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    lastLoginAt: r.last_login_at,
  };
}

// Admin-list rows include an aggregated scene count.
export interface AdminUserRow extends UserRow {
  scene_count: number;
}

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
export interface InviteRow {
  token: string;
  created_by: string;
  created_at: number;
  expires_at: number | null;
  used_by_user_id: string | null;
  used_at: number | null;
  revoked_at: number | null;
}

export type InviteStatus = "pending" | "used" | "revoked" | "expired";

export interface InvitePublic {
  token: string;
  status: InviteStatus;
  createdBy: string;            // user id of creator
  createdByEmail?: string;      // joined for admin listing
  createdAt: number;
  expiresAt: number | null;
  usedByUserId: string | null;
  usedByEmail?: string | null;  // joined for admin listing
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
export interface InviteAdminRow extends InviteRow {
  created_by_email: string | null;
  used_by_email: string | null;
}

export function rowToInvitePublic(
  r: InviteRow | InviteAdminRow,
  nowMs: number
): InvitePublic {
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
export interface FolderRow {
  id: string;
  owner: string;
  parent_id: string | null;
  name: string;
  is_default: number;          // 0 | 1
  created_at: number;
  updated_at: number;
}

export interface FolderMeta {
  id: string;
  parentId: string | null;
  name: string;
  isDefault: boolean;
  tags: string[];
  sceneCount: number;          // direct children only
  subfolderCount: number;      // direct children only
  createdAt: number;
  updatedAt: number;
}

export function rowToFolderMeta(
  r: FolderRow,
  extras: { tags?: string[]; sceneCount?: number; subfolderCount?: number } = {}
): FolderMeta {
  return {
    id: r.id,
    parentId: r.parent_id,
    name: r.name,
    isDefault: !!r.is_default,
    tags: extras.tags ?? [],
    sceneCount: extras.sceneCount ?? 0,
    subfolderCount: extras.subfolderCount ?? 0,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

// ─── Scenes ───────────────────────────────────────────────────────────
// D1 row shape for the `scenes` table.
export interface SceneRow {
  id: string;
  owner: string;               // users.id
  folder_id: string | null;    // FK to folders.id; app keeps it non-null
  name: string;
  version: number;
  size_bytes: number;
  has_thumb: number;           // 0 | 1
  created_at: number;
  updated_at: number;
}

// API-facing metadata (omits internal fields).
export interface SceneMeta {
  id: string;
  folderId: string;
  name: string;
  tags: string[];
  version: number;
  sizeBytes: number;
  hasThumb: boolean;
  createdAt: number;
  updatedAt: number;
}

export function rowToMeta(r: SceneRow, tags: string[] = []): SceneMeta {
  return {
    id: r.id,
    folderId: r.folder_id ?? "",
    name: r.name,
    tags,
    version: r.version,
    sizeBytes: r.size_bytes,
    hasThumb: !!r.has_thumb,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

// ─── Tags ─────────────────────────────────────────────────────────────
export interface TagRow {
  id: string;
  owner: string;
  name: string;
  created_at: number;
}

export interface TagPublic {
  id: string;
  name: string;
  sceneCount: number;
  folderCount: number;
}

export type TagTargetType = "scene" | "folder";

export interface TaggingRow {
  tag_id: string;
  target_type: TagTargetType;
  target_id: string;
  owner: string;
  created_at: number;
}

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

export interface ShareRow {
  token: string;
  owner: string;
  target_type: ShareTargetType;
  target_id: string;
  permission: SharePermission;
  allow_download: number;        // 0 | 1
  label: string | null;
  created_at: number;
  expires_at: number | null;
  revoked_at: number | null;
  last_accessed_at: number | null;
}

export interface SharePublic {
  token: string;
  targetType: ShareTargetType;
  targetId: string;
  targetName?: string;           // joined for listing
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
    allowDownload: !!r.allow_download,
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
