// React Query hooks for the dashboard / explorer surface: folders, tags,
// and scene listings.
//
// All mutations invalidate the broadest sensible key prefix on success,
// so the three explorer views (Browse, Recent, Search) refresh without
// the consumer wiring them up. This replaces the manual `refreshTick`
// prop that used to be plumbed from Dashboard down into each view.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  type ApiError,
  type FolderMeta,
  folders,
  type SceneMeta,
  type ScenesQuery,
  scenes,
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

export function useScenes(query: ScenesQuery) {
  return useQuery<SceneMeta[], ApiError>({
    queryKey: keys.scenes.list(query),
    queryFn: () => scenes.list(query),
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
      // Folder deletion cascades into scenes and shares server-side.
      qc.invalidateQueries({ queryKey: keys.folders.all });
      qc.invalidateQueries({ queryKey: keys.scenes.all });
      qc.invalidateQueries({ queryKey: keys.tags.all });
      qc.invalidateQueries({ queryKey: keys.sharesAll });
    },
  });
}

// ─── Scene list-side mutations ────────────────────────────────────────

export function useCreateScene() {
  const qc = useQueryClient();
  return useMutation<SceneMeta, ApiError, Parameters<typeof scenes.create>[0] | undefined>({
    mutationFn: (body) => scenes.create(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.scenes.all });
      // sceneCount in folders is affected.
      qc.invalidateQueries({ queryKey: keys.folders.all });
    },
  });
}

export function useRenameScene() {
  const qc = useQueryClient();
  return useMutation<SceneMeta, ApiError, { id: string; name: string }>({
    mutationFn: ({ id, name }) => scenes.rename(id, name),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.scenes.all });
    },
  });
}

export function useMoveScene() {
  const qc = useQueryClient();
  return useMutation<SceneMeta, ApiError, { id: string; folderId: string | null }>({
    mutationFn: ({ id, folderId }) => scenes.move(id, folderId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.scenes.all });
      qc.invalidateQueries({ queryKey: keys.folders.all });
    },
  });
}

export function useDeleteScene() {
  const qc = useQueryClient();
  return useMutation<{ ok: true }, ApiError, string>({
    mutationFn: (id) => scenes.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.scenes.all });
      qc.invalidateQueries({ queryKey: keys.folders.all });
      qc.invalidateQueries({ queryKey: keys.sharesAll });
    },
  });
}

export function useSetSceneTags() {
  const qc = useQueryClient();
  return useMutation<
    { id: string; tags: string[]; updatedAt: number },
    ApiError,
    { id: string; tags: string[] }
  >({
    mutationFn: ({ id, tags: t }) => scenes.setTags(id, t),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.scenes.all });
      qc.invalidateQueries({ queryKey: keys.tags.all });
    },
  });
}
