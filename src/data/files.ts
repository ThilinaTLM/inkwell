// File data hooks.
//
// IMPORTANT: file *save* (the autosave PUT for an open editor) is NOT
// a `useMutation` here. The save-lifecycle hook in
// `src/features/editor/lifecycle/useSaveLifecycle.ts` has its own
// dedup ref, version handshake, and 409-reload-then-reset semantics
// that don't compose with mutation lifecycle. The save closure stays
// in the editor page and does its own optimistic cache update.
//
// `useFile` IS a query, but with `staleTime: Infinity` so the editor
// owns the working copy after first arrival; we never refetch in the
// background and clobber unsaved edits. Reload-after-409 is done via
// `queryClient.fetchQuery` from the page.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  type ApiError,
  type FileMeta,
  type FilesQuery,
  files,
  type LoadedFile,
} from "@/lib/api/client";
import { keys } from "@/lib/api/query-keys";
import { invalidations } from "./invalidations";

// ─── Queries ──────────────────────────────────────────────────────────
export function useFiles(query: FilesQuery) {
  return useQuery<FileMeta[], ApiError>({
    queryKey: keys.files.list(query),
    queryFn: () => files.list(query),
  });
}

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

// ─── Mutations ───────────────────────────────────────────────────────
export function useCreateFile() {
  const qc = useQueryClient();
  return useMutation<FileMeta, ApiError, Parameters<typeof files.create>[0] | undefined>({
    mutationFn: (body) => files.create(body),
    onSuccess: () => invalidations.fileMutated(qc),
  });
}

export function useRenameFile() {
  const qc = useQueryClient();
  return useMutation<FileMeta, ApiError, { id: string; name: string }>({
    mutationFn: ({ id, name }) => files.rename(id, name),
    onSuccess: () => invalidations.fileMutated(qc),
  });
}

export function useMoveFile() {
  const qc = useQueryClient();
  return useMutation<FileMeta, ApiError, { id: string; folderId: string | null }>({
    mutationFn: ({ id, folderId }) => files.move(id, folderId),
    onSuccess: () => invalidations.fileMutated(qc),
  });
}

export function useDeleteFile() {
  const qc = useQueryClient();
  return useMutation<{ ok: true }, ApiError, string>({
    mutationFn: (id) => files.delete(id),
    onSuccess: () => invalidations.fileMutated(qc, { sharesChanged: true }),
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
    onSuccess: () => invalidations.fileMutated(qc, { tagsChanged: true }),
  });
}
