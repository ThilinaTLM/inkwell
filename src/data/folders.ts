// Folder data hooks.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type ApiError, type FolderMeta, folders } from "@/lib/api/client";
import { keys } from "@/lib/api/query-keys";
import { invalidations } from "./invalidations";

export function useFolders() {
  return useQuery<FolderMeta[], ApiError>({
    queryKey: keys.folders.list(),
    queryFn: () => folders.list(),
  });
}

export function useCreateFolder() {
  const qc = useQueryClient();
  return useMutation<FolderMeta, ApiError, Parameters<typeof folders.create>[0]>({
    mutationFn: (body) => folders.create(body),
    onSuccess: () => invalidations.folderMutated(qc, { tagsChanged: true }),
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
    onSuccess: () => invalidations.folderMutated(qc, { tagsChanged: true }),
  });
}

export function useDeleteFolder() {
  const qc = useQueryClient();
  return useMutation<{ ok: true }, ApiError, string>({
    mutationFn: (id) => folders.delete(id),
    onSuccess: () =>
      invalidations.folderMutated(qc, {
        // Folder deletion cascades into files and shares server-side.
        filesChanged: true,
        tagsChanged: true,
        sharesChanged: true,
      }),
  });
}
