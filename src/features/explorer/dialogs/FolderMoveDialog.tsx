// Folder move — uses <MoveToFolderDialog>, but precomputes the set of
// forbidden destinations (the folder itself + its descendants) so a
// folder can't be moved into its own subtree.

import { useMemo } from "react";
import { toast } from "sonner";
import { useUpdateFolder } from "@/features/explorer/hooks";
import { MoveToFolderDialog } from "@/features/folders/MoveToFolderDialog";
import type { FolderMeta } from "@/lib/api/client";
import { errorMessage } from "@/lib/errors";

interface FolderMoveDialogProps {
  folder: FolderMeta | null;
  folders: FolderMeta[];
  onOpenChange: (open: boolean) => void;
}

export function FolderMoveDialog({ folder, folders, onOpenChange }: FolderMoveDialogProps) {
  const update = useUpdateFolder();

  // BFS through the descendants of `folder.id` to find every id that
  // would create a cycle if chosen as the new parent.
  const forbidden = useMemo(() => {
    if (!folder) return new Set<string>();
    const out = new Set<string>([folder.id]);
    const childrenOf = new Map<string | null, FolderMeta[]>();
    for (const f of folders) {
      const arr = childrenOf.get(f.parentId) || [];
      arr.push(f);
      childrenOf.set(f.parentId, arr);
    }
    const queue: string[] = [folder.id];
    while (queue.length) {
      const id = queue.shift();
      if (id === undefined) break;
      for (const c of childrenOf.get(id) || []) {
        if (!out.has(c.id)) {
          out.add(c.id);
          queue.push(c.id);
        }
      }
    }
    return out;
  }, [folder, folders]);

  if (!folder) return null;

  return (
    <MoveToFolderDialog
      open
      onOpenChange={onOpenChange}
      folders={folders}
      initialId={folder.parentId}
      forbiddenIds={forbidden}
      title={`Move "${folder.name}"`}
      description="Pick a new parent folder, or choose Top level for the root."
      onSubmit={async (parentId) => {
        if (parentId === folder.parentId) return;
        if (parentId === folder.id) return;
        try {
          await update.mutateAsync({
            id: folder.id,
            patch: { parentId },
          });
          toast.success("Moved.");
          onOpenChange(false);
        } catch (e) {
          toast.error(errorMessage(e, "could not move"));
        }
      }}
    />
  );
}
