// Thin fetch wrapper for the Inkwell Worker API. Always uses same-origin and
// `credentials: "include"` so the session cookie is sent automatically.
//
// Errors are surfaced as `ApiError` so callers can branch on `status` (e.g.
// 401 → redirect to /login, 409 → version conflict).

export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  isAdmin: boolean;
}

export interface MeResponse extends User {
  expiresAt: number;
}

export interface AdminUser extends User {
  disabled: boolean;
  createdAt: number;
  updatedAt: number;
  lastLoginAt: number | null;
  sceneCount: number;
}

export type InviteStatus = "pending" | "used" | "revoked" | "expired";

export interface Invite {
  token: string;
  status: InviteStatus;
  createdBy: string;
  createdByEmail?: string;
  createdAt: number;
  expiresAt: number | null;
  usedByUserId: string | null;
  usedByEmail?: string | null;
  usedAt: number | null;
  revokedAt: number | null;
}

export interface SceneMeta {
  id: string;
  /** `null` when the scene lives at the root level (no parent folder). */
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

/** Compact preview info for a single scene inside a folder. Returned
 *  inside `FolderMeta.previews` so `FolderCard` can render thumbnails
 *  between the folds without an extra round trip. */
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
  sceneCount: number;
  subfolderCount: number;
  /** Up to 2 most-recently-updated scenes inside this folder, newest first. */
  previews: ScenePreview[];
  createdAt: number;
  updatedAt: number;
}

export interface Tag {
  id: string;
  name: string;
  sceneCount: number;
  folderCount: number;
}

export interface SceneBlob {
  elements: unknown[];
  appState?: Record<string, unknown>;
  files?: Record<string, unknown>;
}

export interface LoadedScene {
  meta: { id: string; name: string; version: number; updatedAt: number };
  blob: SceneBlob;
  /** Permission when loaded via a share token. Owner-loaded scenes are 'write'. */
  permission: "read" | "write";
  /** True if the share token allows downloading the .excalidraw file. */
  allowDownload: boolean;
}

export type SharePermission = "read" | "write";
export type ShareTargetType = "scene" | "folder";

export interface Share {
  token: string;
  targetType: ShareTargetType;
  targetId: string;
  targetName?: string;
  permission: SharePermission;
  allowDownload: boolean;
  label: string | null;
  createdAt: number;
  expiresAt: number | null;
  lastAccessedAt: number | null;
}

export interface FolderSharePayload {
  share: {
    token: string;
    permission: SharePermission;
    allowDownload: boolean;
    label: string | null;
  };
  root: FolderMeta;
  folders: FolderMeta[];
  scenes: SceneMeta[];
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public payload?: unknown,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const resp = await fetch(path, { credentials: "include", ...init });
  if (!resp.ok) {
    let payload: unknown;
    try {
      payload = await resp.json();
    } catch {
      /* non-JSON */
    }
    let msg = `HTTP ${resp.status}`;
    if (payload && typeof payload === "object" && "error" in payload) {
      msg = String((payload as { error: unknown }).error);
    }
    throw new ApiError(resp.status, msg, payload);
  }
  if (resp.status === 204) return undefined as T;
  return (await resp.json()) as T;
}

function postJson<T>(path: string, body: unknown): Promise<T> {
  return request<T>(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
}

function patchJson<T>(path: string, body: unknown): Promise<T> {
  return request<T>(path, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
}

function putJson<T>(path: string, body: unknown): Promise<T> {
  return request<T>(path, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
}

// ─── Auth ─────────────────────────────────────────────────────────────
export const auth = {
  login: (email: string, password: string) =>
    postJson<User>("/api/auth/login", { email, password }),
  logout: () => request<void>("/api/auth/logout", { method: "POST" }),
  me: () => request<MeResponse>("/api/me"),
  changePassword: (currentPassword: string, newPassword: string) =>
    postJson<{ ok: true }>("/api/me/password", { currentPassword, newPassword }),
};

// ─── Invites (public side) ────────────────────────────────────────────
export const invites = {
  /** Validates an invite token before showing the signup form. */
  peek: (token: string) => request<{ ok: true; expiresAt: number | null }>(`/api/invites/${token}`),
  /** Accepts an invite and creates the user. Sets the session cookie on success. */
  accept: (
    token: string,
    body: { email: string; password: string; firstName: string; lastName: string },
  ) => postJson<User>(`/api/invites/${token}/accept`, body),
};

// ─── Admin ────────────────────────────────────────────────────────────
export const admin = {
  listUsers: () => request<{ users: AdminUser[] }>("/api/admin/users").then((r) => r.users),
  updateUser: (
    id: string,
    patch: Partial<{ isAdmin: boolean; disabled: boolean; firstName: string; lastName: string }>,
  ) => patchJson<AdminUser>(`/api/admin/users/${id}`, patch),
  deleteUser: (id: string) => request<{ ok: true }>(`/api/admin/users/${id}`, { method: "DELETE" }),

  listInvites: () => request<{ invites: Invite[] }>("/api/admin/invites").then((r) => r.invites),
  createInvite: (expiresInHours: number | null) =>
    postJson<{ token: string; url: string; expiresAt: number | null; createdAt: number }>(
      "/api/admin/invites",
      { expiresInHours },
    ),
  revokeInvite: (token: string) =>
    request<{ ok: true }>(`/api/admin/invites/${token}`, { method: "DELETE" }),
};

// ─── Folders ──────────────────────────────────────────────────────────
export const folders = {
  list: () => request<{ folders: FolderMeta[] }>("/api/folders").then((r) => r.folders),
  create: (body: { name: string; parentId?: string | null; tags?: string[] }) =>
    postJson<FolderMeta>("/api/folders", body),
  update: (id: string, body: { name?: string; parentId?: string | null; tags?: string[] }) =>
    patchJson<FolderMeta>(`/api/folders/${id}`, body),
  delete: (id: string) => request<{ ok: true }>(`/api/folders/${id}`, { method: "DELETE" }),

  listShares: (id: string) =>
    request<{ tokens: Share[] }>(`/api/folders/${id}/shares`).then((r) => r.tokens),
  createShare: (
    id: string,
    body: {
      permission: SharePermission;
      allowDownload?: boolean;
      expiresAt?: number | null;
      label?: string | null;
    },
  ) => postJson<Share>(`/api/folders/${id}/shares`, body),
  revokeShare: (id: string, token: string) =>
    request<{ ok: true }>(`/api/folders/${id}/shares/${token}`, { method: "DELETE" }),
};

// ─── Tags ─────────────────────────────────────────────────────────────
export const tags = {
  list: () => request<{ tags: Tag[] }>("/api/tags").then((r) => r.tags),
  rename: (id: string, name: string) =>
    patchJson<{ id: string; name: string }>(`/api/tags/${id}`, { name }),
  delete: (id: string) => request<{ ok: true }>(`/api/tags/${id}`, { method: "DELETE" }),
};

// ─── Scene listing query ──────────────────────────────────────────────
export interface ScenesQuery {
  /**
   * Folder filter. A real folder id scopes the listing to that folder's
   * direct children (combine with `recursive` for the whole subtree).
   * The literal string `"root"` lists scenes that live at the top level
   * (no parent folder). Omitting the field returns every scene the
   * caller owns — used by the Recent and Search views.
   */
  folderId?: string | "root";
  recursive?: boolean;
  tags?: string[];
  q?: string;
}

function buildScenesUrl(q: ScenesQuery): string {
  const url = new URL("/api/scenes", location.origin);
  if (q.folderId) url.searchParams.set("folderId", q.folderId);
  if (q.recursive) url.searchParams.set("recursive", "1");
  for (const t of q.tags || []) url.searchParams.append("tag", t);
  if (q.q) url.searchParams.set("q", q.q);
  return url.pathname + (url.search || "");
}

// ─── Scenes ───────────────────────────────────────────────────────────
export const scenes = {
  list: (query: ScenesQuery = {}) =>
    request<{ scenes: SceneMeta[] }>(buildScenesUrl(query)).then((r) => r.scenes),
  create: (body: { name?: string; folderId?: string | null; tags?: string[] } = {}) =>
    postJson<SceneMeta>("/api/scenes", body),
  rename: (id: string, name: string) => patchJson<SceneMeta>(`/api/scenes/${id}`, { name }),
  /** Move a scene. `folderId === null` moves to the root level. */
  move: (id: string, folderId: string | null) =>
    patchJson<SceneMeta>(`/api/scenes/${id}`, { folderId }),
  setTags: (id: string, tagList: string[]) =>
    putJson<{ id: string; tags: string[]; updatedAt: number }>(`/api/scenes/${id}/tags`, {
      tags: tagList,
    }),
  delete: (id: string) => request<{ ok: true }>(`/api/scenes/${id}`, { method: "DELETE" }),

  /** Loads a scene the current user owns. */
  async load(id: string): Promise<LoadedScene> {
    const resp = await fetch(`/api/scenes/${id}`, { credentials: "include" });
    if (!resp.ok) throw new ApiError(resp.status, `HTTP ${resp.status}`);
    return readSceneResponse(resp, "write", true);
  },

  /** Saves a scene. Throws ApiError(409) on version conflict. */
  async save(id: string, version: number, blob: SceneBlob): Promise<SceneMeta> {
    const resp = await fetch(`/api/scenes/${id}`, {
      method: "PUT",
      credentials: "include",
      headers: {
        "content-type": "application/json",
        "if-match": `"${version}"`,
      },
      body: JSON.stringify(blob),
    });
    if (!resp.ok) {
      let payload: { error?: string } | null = null;
      try {
        payload = await resp.json();
      } catch {
        /* */
      }
      throw new ApiError(resp.status, payload?.error || `HTTP ${resp.status}`, payload);
    }
    return (await resp.json()) as SceneMeta;
  },

  putThumb: (id: string, svg: string) =>
    fetch(`/api/scenes/${id}/thumb`, {
      method: "PUT",
      credentials: "include",
      headers: { "content-type": "image/svg+xml" },
      body: svg,
    }).then((r) => {
      if (!r.ok) throw new ApiError(r.status, `HTTP ${r.status}`);
    }),

  /** Build a thumb URL with a content-addressed cache-bust token.
   *  Pass `thumbUpdatedAt` from `SceneMeta` (or `ScenePreview`); a
   *  zero/missing token still produces a valid URL but won't change
   *  when content changes — callers should always pass the real value. */
  thumbUrl: (id: string, bust?: number) =>
    `/api/scenes/${id}/thumb${bust ? `?v=${bust}` : ""}`,

  /** Same-origin download URL that triggers a `Content-Disposition: attachment`. */
  downloadUrl: (id: string) => `/api/scenes/${id}/download`,

  /** Owner-side scene shares. */
  listShares: (id: string) =>
    request<{ tokens: Share[] }>(`/api/scenes/${id}/shares`).then((r) => r.tokens),
  createShare: (
    id: string,
    body: {
      permission: SharePermission;
      allowDownload?: boolean;
      expiresAt?: number | null;
      label?: string | null;
    },
  ) => postJson<Share>(`/api/scenes/${id}/shares`, body),
  revokeShare: (id: string, token: string) =>
    request<{ ok: true }>(`/api/scenes/${id}/shares/${token}`, { method: "DELETE" }),
};

// ─── Shares (cross-target) ────────────────────────────────────────────
export const shares = {
  /** All of caller's active shares (scenes + folders), with target name. */
  listAll: () => request<{ shares: Share[] }>("/api/shares").then((r) => r.shares),
  revoke: (token: string) => request<{ ok: true }>(`/api/shares/${token}`, { method: "DELETE" }),

  // ── Public token operations (scene shares) ────────────────────────
  async load(token: string): Promise<LoadedScene> {
    const resp = await fetch(`/api/share/${token}`, { credentials: "include" });
    if (!resp.ok) throw new ApiError(resp.status, `HTTP ${resp.status}`);
    const perm = (resp.headers.get("x-share-permission") as "read" | "write") || "read";
    const allowDownload = resp.headers.get("x-share-allow-download") === "1";
    return readSceneResponse(resp, perm, allowDownload);
  },

  async save(token: string, version: number, blob: SceneBlob): Promise<SceneMeta> {
    const resp = await fetch(`/api/share/${token}`, {
      method: "PUT",
      credentials: "include",
      headers: { "content-type": "application/json", "if-match": `"${version}"` },
      body: JSON.stringify(blob),
    });
    if (!resp.ok) {
      let payload: { error?: string } | null = null;
      try {
        payload = await resp.json();
      } catch {
        /* */
      }
      throw new ApiError(resp.status, payload?.error || `HTTP ${resp.status}`, payload);
    }
    return (await resp.json()) as SceneMeta;
  },

  downloadUrl: (token: string) => `/api/share/${token}/download`,

  /**
   * Resolves a token without committing to scene/folder semantics. The
   * `targetType` header from the worker tells us which page to render.
   */
  async peek(
    token: string,
  ): Promise<
    { type: "scene"; scene: LoadedScene } | { type: "folder"; payload: FolderSharePayload }
  > {
    const resp = await fetch(`/api/share/${token}`, { credentials: "include" });
    if (!resp.ok) throw new ApiError(resp.status, `HTTP ${resp.status}`);
    const targetType = resp.headers.get("x-share-target-type") || "scene";
    if (targetType === "folder") {
      const payload = (await resp.json()) as FolderSharePayload;
      return { type: "folder", payload };
    }
    const perm = (resp.headers.get("x-share-permission") as "read" | "write") || "read";
    const allowDownload = resp.headers.get("x-share-allow-download") === "1";
    const scene = await readSceneResponse(resp, perm, allowDownload);
    return { type: "scene", scene };
  },

  // ── Public token operations (folder shares) ───────────────────────
  loadFolder: (token: string) => request<FolderSharePayload>(`/api/share/${token}`),

  async loadFolderScene(token: string, sceneId: string): Promise<LoadedScene> {
    const resp = await fetch(`/api/share/${token}/scenes/${sceneId}`, {
      credentials: "include",
    });
    if (!resp.ok) throw new ApiError(resp.status, `HTTP ${resp.status}`);
    const perm = (resp.headers.get("x-share-permission") as "read" | "write") || "read";
    const allowDownload = resp.headers.get("x-share-allow-download") === "1";
    return readSceneResponse(resp, perm, allowDownload);
  },

  async saveFolderScene(
    token: string,
    sceneId: string,
    version: number,
    blob: SceneBlob,
  ): Promise<SceneMeta> {
    const resp = await fetch(`/api/share/${token}/scenes/${sceneId}`, {
      method: "PUT",
      credentials: "include",
      headers: { "content-type": "application/json", "if-match": `"${version}"` },
      body: JSON.stringify(blob),
    });
    if (!resp.ok) {
      let payload: { error?: string } | null = null;
      try {
        payload = await resp.json();
      } catch {
        /* */
      }
      throw new ApiError(resp.status, payload?.error || `HTTP ${resp.status}`, payload);
    }
    return (await resp.json()) as SceneMeta;
  },

  folderSceneThumbUrl: (token: string, sceneId: string) =>
    `/api/share/${token}/scenes/${sceneId}/thumb`,
  folderSceneDownloadUrl: (token: string, sceneId: string) =>
    `/api/share/${token}/scenes/${sceneId}/download`,
  sceneThumbUrl: (token: string) => `/api/share/${token}/thumb`,
};

// ─── Internal helpers ─────────────────────────────────────────────────
async function readSceneResponse(
  resp: Response,
  permission: "read" | "write",
  allowDownload: boolean,
): Promise<LoadedScene> {
  const id = resp.headers.get("x-scene-id") || "";
  const name = decodeURIComponent(resp.headers.get("x-scene-name") || "Untitled");
  const version = Number(resp.headers.get("x-scene-version") || "1");
  const updatedAt = Number(resp.headers.get("x-scene-updated-at") || "0");
  const blob = (await resp.json()) as SceneBlob;
  return {
    meta: { id, name, version, updatedAt },
    blob,
    permission,
    allowDownload,
  };
}
