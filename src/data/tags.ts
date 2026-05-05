// Tag data hooks.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type ApiError, type Tag, tags } from "@/lib/api/client";
import { keys } from "@/lib/api/query-keys";
import { invalidations } from "./invalidations";

export function useTags() {
  return useQuery<Tag[], ApiError>({
    queryKey: keys.tags.list(),
    queryFn: () => tags.list(),
  });
}

// Renaming or deleting a tag affects every file, folder, and tag list
// that references it.
export function useRenameTag() {
  const qc = useQueryClient();
  return useMutation<{ id: string; name: string }, ApiError, { id: string; name: string }>({
    mutationFn: ({ id, name }) => tags.rename(id, name),
    onSuccess: () => invalidations.tagMutated(qc),
  });
}

export function useDeleteTag() {
  const qc = useQueryClient();
  return useMutation<{ ok: true }, ApiError, string>({
    mutationFn: (id) => tags.delete(id),
    onSuccess: () => invalidations.tagMutated(qc),
  });
}
