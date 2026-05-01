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

// ─── Scenes ───────────────────────────────────────────────────────────
// D1 row shape for the `scenes` table.
export interface SceneRow {
  id: string;
  owner: string;               // users.id
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
  name: string;
  version: number;
  sizeBytes: number;
  hasThumb: boolean;
  createdAt: number;
  updatedAt: number;
}

export function rowToMeta(r: SceneRow): SceneMeta {
  return {
    id: r.id,
    name: r.name,
    version: r.version,
    sizeBytes: r.size_bytes,
    hasThumb: !!r.has_thumb,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

// What the client PUTs as a scene blob. We don't validate the inner shape
// of `elements` / `appState` / `files` — Excalidraw owns that schema and
// it changes between versions. We just round-trip the JSON.
export interface SceneBlob {
  elements: unknown[];
  appState?: Record<string, unknown>;
  files?: Record<string, unknown>;
}

// ─── Share tokens ─────────────────────────────────────────────────────
export type SharePermission = "read" | "write";

export interface ShareTokenRow {
  token: string;
  scene_id: string;
  permission: SharePermission;
  created_at: number;
  expires_at: number | null;
}
