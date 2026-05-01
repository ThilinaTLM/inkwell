// Shared Worker types. Mirrors the bindings declared in wrangler.toml.

export interface Env {
  ASSETS: Fetcher;
  R2: R2Bucket;
  DB: D1Database;
  // Secrets — set via `wrangler secret put`.
  AUTH_PASSWORD: string;
  SESSION_SECRET: string;
  // Vars
  ALLOWED_ORIGINS?: string;
}

// D1 row shape for the `scenes` table.
export interface SceneRow {
  id: string;
  owner: string;
  name: string;
  version: number;
  size_bytes: number;
  has_thumb: number; // 0 | 1
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

// Permissions on a share token.
export type SharePermission = "read" | "write";

export interface ShareTokenRow {
  token: string;
  scene_id: string;
  permission: SharePermission;
  created_at: number;
  expires_at: number | null;
}
