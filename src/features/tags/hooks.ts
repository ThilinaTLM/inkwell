// Tag CRUD hooks.
//
// Renaming or deleting a tag affects every scene, folder, and tag list
// that references it, so both mutations invalidate the world (the three
// affected domain prefixes).

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { type ApiError, tags } from "@/lib/api/client";
import { keys } from "@/lib/api/query-keys";

export function useRenameTag() {
  const qc = useQueryClient();
  return useMutation<{ id: string; name: string }, ApiError, { id: string; name: string }>({
    mutationFn: ({ id, name }) => tags.rename(id, name),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.tags.all });
      qc.invalidateQueries({ queryKey: keys.scenes.all });
      qc.invalidateQueries({ queryKey: keys.folders.all });
    },
  });
}

export function useDeleteTag() {
  const qc = useQueryClient();
  return useMutation<{ ok: true }, ApiError, string>({
    mutationFn: (id) => tags.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.tags.all });
      qc.invalidateQueries({ queryKey: keys.scenes.all });
      qc.invalidateQueries({ queryKey: keys.folders.all });
    },
  });
}
