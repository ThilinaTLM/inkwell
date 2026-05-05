// Folder rename — wraps <RenameDialog> with the update-folder mutation.

import { RenameDialog } from "@/components/RenameDialog";
import { useUpdateFolder } from "@/data/folders";
import { useMutationWithToast } from "@/data/useMutationWithToast";
import type { FolderMeta } from "@/lib/api/client";

interface FolderRenameDialogProps {
  folder: FolderMeta | null;
  onOpenChange: (open: boolean) => void;
}

export function FolderRenameDialog({ folder, onOpenChange }: FolderRenameDialogProps) {
  const run = useMutationWithToast(useUpdateFolder(), {
    success: (m) => `Renamed to "${m.name}".`,
    fallback: "rename failed",
  });
  return (
    <RenameDialog
      open={!!folder}
      onOpenChange={onOpenChange}
      title="Rename folder"
      initialValue={folder?.name ?? ""}
      submitLabel="Rename"
      onSubmit={async (name) => {
        if (!folder) return;
        if (await run({ id: folder.id, patch: { name } })) onOpenChange(false);
      }}
    />
  );
}
