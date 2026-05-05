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
  fileCount: number;
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

export type FileKind = "excalidraw" | "drawio";

export interface FileMeta {
  id: string;
  /** `null` when the file lives at the root level (no parent folder). */
  folderId: string | null;
  name: string;
  kind: FileKind;
  tags: string[];
  version: number;
  sizeBytes: number;
  hasThumb: boolean;
  /** Cache-bust token for `/api/files/:id/thumb`. Bumped to `now()` on
   *  every successful thumb upload; `0` means no thumb yet. */
  thumbUpdatedAt: number;
  /** Number of currently-active share tokens whose target is this file.
   *  Drives the "shared" pill on `FileCard`. Always 0 in visitor
   *  responses (folder-share listing) so recipients can't infer how
   *  many other shares the owner has. */
  activeShareCount: number;
  createdAt: number;
  updatedAt: number;
}

/** Compact preview info for a single file inside a folder. Returned
 *  inside `FolderMeta.previews` so `FolderCard` can render thumbnails
 *  between the folds without an extra round trip. */
export interface FilePreview {
  id: string;
  kind: FileKind;
  hasThumb: boolean;
  thumbUpdatedAt: number;
}

export interface FolderMeta {
  id: string;
  parentId: string | null;
  name: string;
  tags: string[];
  fileCount: number;
  subfolderCount: number;
  /** Up to 3 most-recently-updated files inside this folder, newest first.
   *  `previews[0]` is the front-most paper in the FolderCard stack. */
  previews: FilePreview[];
  /** Number of currently-active share tokens whose target is this folder.
   *  Drives the "shared" pill on `FolderCard`. Always 0 in visitor
   *  responses so recipients can't infer how many other shares the
   *  owner has. */
  activeShareCount: number;
  createdAt: number;
  updatedAt: number;
}

export interface Tag {
  id: string;
  name: string;
  fileCount: number;
  folderCount: number;
}

export interface ExcalidrawFileBlob {
  /** Optional for backward compatibility with existing stored blobs. */
  kind?: "excalidraw";
  elements: unknown[];
  appState?: Record<string, unknown>;
  files?: Record<string, unknown>;
}

export interface DrawioFileBlob {
  kind: "drawio";
  xml: string;
}

export type FileBlob = ExcalidrawFileBlob | DrawioFileBlob;

export interface LoadedFile {
  meta: {
    id: string;
    name: string;
    kind: FileKind;
    version: number;
    updatedAt: number;
    /** Parent folder, or `null` when the file lives at the root.
     *  Only populated for owner-loaded files; share-token loads omit it. */
    folderId: string | null;
  };
  blob: FileBlob;
  /** Permission when loaded via a share token. Owner-loaded files are 'write'. */
  permission: "read" | "write";
  /** True if the share token allows downloading the file. */
  allowDownload: boolean;
}

export type SharePermission = "read" | "write";
export type ShareTargetType = "file" | "folder";

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
  files: FileMeta[];
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

// ─── File listing query ──────────────────────────────────────────────
export interface FilesQuery {
  /**
   * Folder filter. A real folder id scopes the listing to that folder's
   * direct children (combine with `recursive` for the whole subtree).
   * The literal string `"root"` lists files that live at the top level
   * (no parent folder). Omitting the field returns every file the
   * caller owns — used by the Recent and Search views.
   */
  folderId?: string | "root";
  recursive?: boolean;
  tags?: string[];
  q?: string;
}

function buildFilesUrl(q: FilesQuery): string {
  const url = new URL("/api/files", location.origin);
  if (q.folderId) url.searchParams.set("folderId", q.folderId);
  if (q.recursive) url.searchParams.set("recursive", "1");
  for (const t of q.tags || []) url.searchParams.append("tag", t);
  if (q.q) url.searchParams.set("q", q.q);
  return url.pathname + (url.search || "");
}

// ─── Files ────────────────────────────────────────────────────────────
export const files = {
  list: (query: FilesQuery = {}) =>
    request<{ files: FileMeta[] }>(buildFilesUrl(query)).then((r) => r.files),
  create: (
    body: { name?: string; folderId?: string | null; tags?: string[]; kind?: FileKind } = {},
  ) => postJson<FileMeta>("/api/files", body),
  rename: (id: string, name: string) => patchJson<FileMeta>(`/api/files/${id}`, { name }),
  /** Move a file. `folderId === null` moves to the root level. */
  move: (id: string, folderId: string | null) =>
    patchJson<FileMeta>(`/api/files/${id}`, { folderId }),
  setTags: (id: string, tagList: string[]) =>
    putJson<{ id: string; tags: string[]; updatedAt: number }>(`/api/files/${id}/tags`, {
      tags: tagList,
    }),
  delete: (id: string) => request<{ ok: true }>(`/api/files/${id}`, { method: "DELETE" }),

  /** Loads a file the current user owns. */
  async load(id: string): Promise<LoadedFile> {
    const resp = await fetch(`/api/files/${id}`, { credentials: "include" });
    if (!resp.ok) throw new ApiError(resp.status, `HTTP ${resp.status}`);
    return readFileResponse(resp, "write", true);
  },

  /** Saves a file. Throws ApiError(409) on version conflict. */
  async save(id: string, version: number, blob: FileBlob): Promise<FileMeta> {
    const resp = await fetch(`/api/files/${id}`, {
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
    return (await resp.json()) as FileMeta;
  },

  putThumb: (id: string, svg: string) =>
    fetch(`/api/files/${id}/thumb`, {
      method: "PUT",
      credentials: "include",
      headers: { "content-type": "image/svg+xml" },
      body: svg,
    }).then((r) => {
      if (!r.ok) throw new ApiError(r.status, `HTTP ${r.status}`);
    }),

  /** Build a thumb URL with a content-addressed cache-bust token.
   *  Pass `thumbUpdatedAt` from `FileMeta` (or `FilePreview`); a
   *  zero/missing token still produces a valid URL but won't change
   *  when content changes — callers should always pass the real value. */
  thumbUrl: (id: string, bust?: number) => `/api/files/${id}/thumb${bust ? `?v=${bust}` : ""}`,

  /** Same-origin download URL that triggers a `Content-Disposition: attachment`. */
  downloadUrl: (id: string) => `/api/files/${id}/download`,

  /** Owner-side file shares. */
  listShares: (id: string) =>
    request<{ tokens: Share[] }>(`/api/files/${id}/shares`).then((r) => r.tokens),
  createShare: (
    id: string,
    body: {
      permission: SharePermission;
      allowDownload?: boolean;
      expiresAt?: number | null;
      label?: string | null;
    },
  ) => postJson<Share>(`/api/files/${id}/shares`, body),
  revokeShare: (id: string, token: string) =>
    request<{ ok: true }>(`/api/files/${id}/shares/${token}`, { method: "DELETE" }),
};

// ─── Shares (cross-target) ────────────────────────────────────────────
export const shares = {
  /** All of caller's active shares (files + folders), with target name. */
  listAll: () => request<{ shares: Share[] }>("/api/shares").then((r) => r.shares),
  revoke: (token: string) => request<{ ok: true }>(`/api/shares/${token}`, { method: "DELETE" }),

  /** Edit an existing share in place. The URL stays valid; only metadata
   *  changes. Use {@link rotate} when the URL itself must be invalidated. */
  update: (
    token: string,
    body: {
      permission?: SharePermission;
      allowDownload?: boolean;
      expiresAt?: number | null;
      label?: string | null;
    },
  ) => patchJson<Share>(`/api/shares/${token}`, body),

  /** Revoke this token and issue a fresh one with the same settings. The
   *  old URL stops working immediately. Use for leaked-link recovery. */
  rotate: (token: string) =>
    postJson<{ old: { token: string }; new: Share }>(`/api/shares/${token}/rotate`, {}),

  // ── Public token operations (file shares) ─────────────────────────
  async load(token: string): Promise<LoadedFile> {
    const resp = await fetch(`/api/share/${token}`, { credentials: "include" });
    if (!resp.ok) throw new ApiError(resp.status, `HTTP ${resp.status}`);
    const perm = (resp.headers.get("x-share-permission") as "read" | "write") || "read";
    const allowDownload = resp.headers.get("x-share-allow-download") === "1";
    return readFileResponse(resp, perm, allowDownload);
  },

  async save(token: string, version: number, blob: FileBlob): Promise<FileMeta> {
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
    return (await resp.json()) as FileMeta;
  },

  downloadUrl: (token: string) => `/api/share/${token}/download`,

  /**
   * Resolves a token without committing to file/folder semantics. The
   * `targetType` header from the worker tells us which page to render.
   */
  async peek(
    token: string,
  ): Promise<{ type: "file"; file: LoadedFile } | { type: "folder"; payload: FolderSharePayload }> {
    const resp = await fetch(`/api/share/${token}`, { credentials: "include" });
    if (!resp.ok) throw new ApiError(resp.status, `HTTP ${resp.status}`);
    const targetType = resp.headers.get("x-share-target-type") || "file";
    if (targetType === "folder") {
      const payload = (await resp.json()) as FolderSharePayload;
      return { type: "folder", payload };
    }
    const perm = (resp.headers.get("x-share-permission") as "read" | "write") || "read";
    const allowDownload = resp.headers.get("x-share-allow-download") === "1";
    const file = await readFileResponse(resp, perm, allowDownload);
    return { type: "file", file };
  },

  // ── Public token operations (folder shares) ───────────────────────
  loadFolder: (token: string) => request<FolderSharePayload>(`/api/share/${token}`),

  async loadFolderFile(token: string, fileId: string): Promise<LoadedFile> {
    const resp = await fetch(`/api/share/${token}/files/${fileId}`, {
      credentials: "include",
    });
    if (!resp.ok) throw new ApiError(resp.status, `HTTP ${resp.status}`);
    const perm = (resp.headers.get("x-share-permission") as "read" | "write") || "read";
    const allowDownload = resp.headers.get("x-share-allow-download") === "1";
    return readFileResponse(resp, perm, allowDownload);
  },

  async saveFolderFile(
    token: string,
    fileId: string,
    version: number,
    blob: FileBlob,
  ): Promise<FileMeta> {
    const resp = await fetch(`/api/share/${token}/files/${fileId}`, {
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
    return (await resp.json()) as FileMeta;
  },

  folderFileThumbUrl: (token: string, fileId: string) =>
    `/api/share/${token}/files/${fileId}/thumb`,
  folderFileDownloadUrl: (token: string, fileId: string) =>
    `/api/share/${token}/files/${fileId}/download`,
  fileThumbUrl: (token: string) => `/api/share/${token}/thumb`,
};

// ─── Internal helpers ─────────────────────────────────────────────────
async function readFileResponse(
  resp: Response,
  permission: "read" | "write",
  allowDownload: boolean,
): Promise<LoadedFile> {
  const id = resp.headers.get("x-file-id") || "";
  const name = decodeURIComponent(resp.headers.get("x-file-name") || "Untitled");
  const kind = ((resp.headers.get("x-file-kind") || "excalidraw") as FileKind) || "excalidraw";
  const version = Number(resp.headers.get("x-file-version") || "1");
  const updatedAt = Number(resp.headers.get("x-file-updated-at") || "0");
  const folderHeader = resp.headers.get("x-file-folder-id");
  const folderId = folderHeader ? folderHeader : null;
  const blob = (await resp.json()) as FileBlob;
  return {
    meta: { id, name, kind, version, updatedAt, folderId },
    blob,
    permission,
    allowDownload,
  };
}
