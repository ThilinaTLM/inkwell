// Thin fetch wrapper for the Inkwell Worker API. Always uses same-origin and
// `credentials: "include"` so the session cookie is sent automatically.
//
// Errors are surfaced as `ApiError` so callers can branch on `status` (e.g.
// 401 → redirect to /login, 409 → version conflict).

export interface SceneMeta {
  id: string;
  name: string;
  version: number;
  sizeBytes: number;
  hasThumb: boolean;
  createdAt: number;
  updatedAt: number;
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
}

export class ApiError extends Error {
  constructor(public status: number, message: string, public payload?: unknown) {
    super(message);
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const resp = await fetch(path, { credentials: "include", ...init });
  if (!resp.ok) {
    let payload: unknown = undefined;
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
  // Handle 204 No Content gracefully.
  if (resp.status === 204) return undefined as T;
  return (await resp.json()) as T;
}

// ─── Auth ─────────────────────────────────────────────────────────────
export const auth = {
  login: (password: string) =>
    request<{ ok: true }>("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password }),
    }),
  logout: () => request<void>("/api/auth/logout", { method: "POST" }),
  me: () => request<{ owner: string; expiresAt: number }>("/api/me"),
};

// ─── Scenes ───────────────────────────────────────────────────────────
export const scenes = {
  list: () => request<{ scenes: SceneMeta[] }>("/api/scenes").then((r) => r.scenes),
  create: (name?: string) =>
    request<SceneMeta>("/api/scenes", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name }),
    }),
  rename: (id: string, name: string) =>
    request<SceneMeta>(`/api/scenes/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name }),
    }),
  delete: (id: string) => request<{ ok: true }>(`/api/scenes/${id}`, { method: "DELETE" }),

  /** Loads a scene the current user owns. */
  async load(id: string): Promise<LoadedScene> {
    const resp = await fetch(`/api/scenes/${id}`, { credentials: "include" });
    if (!resp.ok) throw new ApiError(resp.status, `HTTP ${resp.status}`);
    return readSceneResponse(resp, "write");
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
      let payload: any = null;
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

  thumbUrl: (id: string, version?: number) =>
    `/api/scenes/${id}/thumb${version ? `?v=${version}` : ""}`,
};

// ─── Share tokens ─────────────────────────────────────────────────────
export interface ShareToken {
  token: string;
  permission: "read" | "write";
  createdAt: number;
  expiresAt: number | null;
}

export const shares = {
  list: (sceneId: string) =>
    request<{ tokens: ShareToken[] }>(`/api/scenes/${sceneId}/shares`).then((r) => r.tokens),
  create: (sceneId: string, permission: "read" | "write" = "read") =>
    request<ShareToken>(`/api/scenes/${sceneId}/shares`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ permission }),
    }),
  revoke: (sceneId: string, token: string) =>
    request<{ ok: true }>(`/api/scenes/${sceneId}/shares/${token}`, { method: "DELETE" }),

  /** Loads a scene via a share token. Permission is read from response headers. */
  async load(token: string): Promise<LoadedScene> {
    const resp = await fetch(`/api/share/${token}`, { credentials: "include" });
    if (!resp.ok) throw new ApiError(resp.status, `HTTP ${resp.status}`);
    const perm = (resp.headers.get("x-share-permission") as "read" | "write") || "read";
    return readSceneResponse(resp, perm);
  },

  async save(token: string, version: number, blob: SceneBlob): Promise<SceneMeta> {
    const resp = await fetch(`/api/share/${token}`, {
      method: "PUT",
      credentials: "include",
      headers: { "content-type": "application/json", "if-match": `"${version}"` },
      body: JSON.stringify(blob),
    });
    if (!resp.ok) {
      let payload: any = null;
      try {
        payload = await resp.json();
      } catch {
        /* */
      }
      throw new ApiError(resp.status, payload?.error || `HTTP ${resp.status}`, payload);
    }
    return (await resp.json()) as SceneMeta;
  },
};

// ─── Internal helpers ─────────────────────────────────────────────────
async function readSceneResponse(resp: Response, permission: "read" | "write"): Promise<LoadedScene> {
  const id = resp.headers.get("x-scene-id") || "";
  const name = decodeURIComponent(resp.headers.get("x-scene-name") || "Untitled");
  const version = Number(resp.headers.get("x-scene-version") || "1");
  const updatedAt = Number(resp.headers.get("x-scene-updated-at") || "0");
  const blob = (await resp.json()) as SceneBlob;
  return { meta: { id, name, version, updatedAt }, blob, permission };
}
