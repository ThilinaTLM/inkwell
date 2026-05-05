// React Query hooks for the dashboard / explorer surface: folders, tags,
// and file listings.
//
// All mutations invalidate the broadest sensible key prefix on success,
// so the three explorer views (Browse, Recent, Search) refresh without
// the consumer wiring them up. This replaces the manual `refreshTick`
// prop that used to be plumbed from Dashboard down into each view.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";
import {
  type ApiError,
  type FileKind,
  type FileMeta,
  type FilesQuery,
  type FolderMeta,
  files,
  folders,
  type Tag,
  tags,
} from "@/lib/api/client";
import { keys } from "@/lib/api/query-keys";

// ─── Queries ──────────────────────────────────────────────────────────

export function useFolders() {
  return useQuery<FolderMeta[], ApiError>({
    queryKey: keys.folders.list(),
    queryFn: () => folders.list(),
  });
}

export function useTags() {
  return useQuery<Tag[], ApiError>({
    queryKey: keys.tags.list(),
    queryFn: () => tags.list(),
  });
}

export function useFiles(query: FilesQuery) {
  return useQuery<FileMeta[], ApiError>({
    queryKey: keys.files.list(query),
    queryFn: () => files.list(query),
  });
}

// ─── Folder mutations ─────────────────────────────────────────────────

export function useCreateFolder() {
  const qc = useQueryClient();
  return useMutation<FolderMeta, ApiError, Parameters<typeof folders.create>[0]>({
    mutationFn: (body) => folders.create(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.folders.all });
      qc.invalidateQueries({ queryKey: keys.tags.all });
    },
  });
}

export function useUpdateFolder() {
  const qc = useQueryClient();
  return useMutation<
    FolderMeta,
    ApiError,
    { id: string; patch: Parameters<typeof folders.update>[1] }
  >({
    mutationFn: ({ id, patch }) => folders.update(id, patch),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.folders.all });
      qc.invalidateQueries({ queryKey: keys.tags.all });
    },
  });
}

export function useDeleteFolder() {
  const qc = useQueryClient();
  return useMutation<{ ok: true }, ApiError, string>({
    mutationFn: (id) => folders.delete(id),
    onSuccess: () => {
      // Folder deletion cascades into files and shares server-side.
      qc.invalidateQueries({ queryKey: keys.folders.all });
      qc.invalidateQueries({ queryKey: keys.files.all });
      qc.invalidateQueries({ queryKey: keys.tags.all });
      qc.invalidateQueries({ queryKey: keys.sharesAll });
    },
  });
}

// ─── File list-side mutations ─────────────────────────────────────────

export function useCreateFile() {
  const qc = useQueryClient();
  return useMutation<FileMeta, ApiError, Parameters<typeof files.create>[0] | undefined>({
    mutationFn: (body) => files.create(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.files.all });
      // fileCount in folders is affected.
      qc.invalidateQueries({ queryKey: keys.folders.all });
    },
  });
}

export function useRenameFile() {
  const qc = useQueryClient();
  return useMutation<FileMeta, ApiError, { id: string; name: string }>({
    mutationFn: ({ id, name }) => files.rename(id, name),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.files.all });
    },
  });
}

export function useMoveFile() {
  const qc = useQueryClient();
  return useMutation<FileMeta, ApiError, { id: string; folderId: string | null }>({
    mutationFn: ({ id, folderId }) => files.move(id, folderId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.files.all });
      qc.invalidateQueries({ queryKey: keys.folders.all });
    },
  });
}

export function useDeleteFile() {
  const qc = useQueryClient();
  return useMutation<{ ok: true }, ApiError, string>({
    mutationFn: (id) => files.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.files.all });
      qc.invalidateQueries({ queryKey: keys.folders.all });
      qc.invalidateQueries({ queryKey: keys.sharesAll });
    },
  });
}

export function useSetFileTags() {
  const qc = useQueryClient();
  return useMutation<
    { id: string; tags: string[]; updatedAt: number },
    ApiError,
    { id: string; tags: string[] }
  >({
    mutationFn: ({ id, tags: t }) => files.setTags(id, t),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.files.all });
      qc.invalidateQueries({ queryKey: keys.tags.all });
    },
  });
}

// ─── Default file kind preference ─────────────────────────────────────
//
// The `New file` split-button creates a file of the user's last-picked
// kind. That preference is per-device and persisted in `localStorage`;
// `useDefaultFileKind` is the React hook around the storage so the
// header button label updates when the user picks the other kind.
//
// localStorage may be unavailable (private browsing, embedded webviews,
// SSR-style first render) — every read/write is wrapped in try/catch
// and falls back to in-memory state.

const DEFAULT_FILE_KIND_KEY = "inkwell.defaultFileKind";

function readStoredKind(): FileKind {
  try {
    const v = localStorage.getItem(DEFAULT_FILE_KIND_KEY);
    return v === "drawio" ? "drawio" : "excalidraw";
  } catch {
    return "excalidraw";
  }
}

function writeStoredKind(kind: FileKind): void {
  try {
    localStorage.setItem(DEFAULT_FILE_KIND_KEY, kind);
  } catch {
    /* ignore */
  }
}

export function useDefaultFileKind(): [FileKind, (kind: FileKind) => void] {
  const [kind, setKindState] = useState<FileKind>(readStoredKind);

  // Keep multiple tabs in sync — the `storage` event fires on changes
  // made in *other* tabs of the same origin.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== DEFAULT_FILE_KIND_KEY) return;
      setKindState(e.newValue === "drawio" ? "drawio" : "excalidraw");
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const setKind = useCallback((next: FileKind) => {
    writeStoredKind(next);
    setKindState(next);
  }, []);

  return [kind, setKind];
}
