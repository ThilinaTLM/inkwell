// Folder delete — wraps <ConfirmDialog>. The body explains where the
// scenes and subfolders go (one level up) and that share links for
// the folder are revoked.

import { ConfirmDialog } from "@/components/ConfirmDialog";
import { useDeleteFolder } from "@/data/folders";
import { useMutationWithToast } from "@/data/useMutationWithToast";
import type { FolderMeta } from "@/lib/api/client";

interface FolderDeleteDialogProps {
  folder: FolderMeta | null;
  onOpenChange: (open: boolean) => void;
  /**
   * Called after the delete succeeds. The dashboard uses this to
   * redirect away from the deleted folder if it was the active view.
   */
  onDeleted?: (folder: FolderMeta) => void;
}

export function FolderDeleteDialog({ folder, onOpenChange, onDeleted }: FolderDeleteDialogProps) {
  const run = useMutationWithToast(useDeleteFolder(), {
    success: () => `Deleted "${folder?.name ?? ""}".`,
    fallback: "could not delete",
  });
  const destination = folder?.parentId ? "the parent folder" : "the top level";
  return (
    <ConfirmDialog
      open={!!folder}
      onOpenChange={onOpenChange}
      title="Delete folder?"
      description={
        <>
          "{folder?.name}" will be removed. Its files and subfolders move up one level (to{" "}
          {destination}). Active share links for this folder are revoked.
        </>
      }
      confirmLabel="Delete"
      busyLabel="Deleting…"
      onConfirm={async () => {
        if (!folder) return;
        if (await run(folder.id)) {
          onDeleted?.(folder);
          onOpenChange(false);
        }
      }}
    />
  );
}
