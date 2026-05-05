// Editor data hooks.
//
// IMPORTANT: file save is NOT a `useMutation`. The autosave loop in
// `ExcalidrawEditor` has its own dedup ref, version handshake, and
// 409-reload-then-reset semantics that don't compose with mutation
// lifecycle. The save closure stays in the page and does its own
// optimistic cache update.
//
// File loading IS a query, but with `staleTime: Infinity` so the editor
// owns the working copy after first arrival; we never refetch in the
// background and clobber unsaved edits. Reload-after-409 is done via
// `queryClient.fetchQuery` from the page.

import { useQuery } from "@tanstack/react-query";
import { type ApiError, files, type LoadedFile, shares } from "@/lib/api/client";
import { keys } from "@/lib/api/query-keys";

export function useFile(id: string) {
  return useQuery<LoadedFile, ApiError>({
    queryKey: keys.files.detail(id),
    queryFn: () => files.load(id),
    enabled: !!id,
    retry: false,
    // Editor owns the working copy after first arrival.
    staleTime: Infinity,
    gcTime: Infinity,
  });
}

/**
 * Loads a shared file by token. When `fileId` is given the token is
 * treated as a folder share and we load the named file; otherwise the
 * token itself addresses a single file share.
 */
export function useSharedFile(token: string, fileId?: string) {
  return useQuery<LoadedFile, ApiError>({
    queryKey: keys.publicShare.token(token, fileId),
    queryFn: () => (fileId ? shares.loadFolderFile(token, fileId) : shares.load(token)),
    enabled: !!token,
    retry: false,
    staleTime: Infinity,
    gcTime: Infinity,
  });
}
