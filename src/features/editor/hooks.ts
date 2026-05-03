// Editor data hooks.
//
// IMPORTANT: scene save is NOT a `useMutation`. The autosave loop in
// `SceneEditor` has its own dedup ref, version handshake, and
// 409-reload-then-reset semantics that don't compose with mutation
// lifecycle. The save closure stays in the page and does its own
// optimistic cache update.
//
// Scene loading IS a query, but with `staleTime: Infinity` so the editor
// owns the working copy after first arrival; we never refetch in the
// background and clobber unsaved edits. Reload-after-409 is done via
// `queryClient.fetchQuery` from the page.

import { useQuery } from "@tanstack/react-query";
import { type ApiError, type LoadedScene, scenes, shares } from "@/lib/api/client";
import { keys } from "@/lib/api/query-keys";

export function useScene(id: string) {
  return useQuery<LoadedScene, ApiError>({
    queryKey: keys.scenes.detail(id),
    queryFn: () => scenes.load(id),
    enabled: !!id,
    retry: false,
    // Editor owns the working copy after first arrival.
    staleTime: Infinity,
    gcTime: Infinity,
  });
}

/**
 * Loads a shared scene by token. When `sceneId` is given the token is
 * treated as a folder share and we load the named scene; otherwise the
 * token itself addresses a single scene share.
 */
export function useSharedScene(token: string, sceneId?: string) {
  return useQuery<LoadedScene, ApiError>({
    queryKey: keys.publicShare.token(token, sceneId),
    queryFn: () => (sceneId ? shares.loadFolderScene(token, sceneId) : shares.load(token)),
    enabled: !!token,
    retry: false,
    staleTime: Infinity,
    gcTime: Infinity,
  });
}
