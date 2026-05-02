// Folder rename — wraps <RenameDialog> with the update-folder mutation.

import { toast } from "sonner";

import { RenameDialog } from "@/components/RenameDialog";
import { useUpdateFolder } from "@/features/explorer/hooks";
import type { FolderMeta } from "@/lib/api/client";
import { errorMessage } from "@/lib/errors";

interface FolderRenameDialogProps {
  folder: FolderMeta | null;
  onOpenChange: (open: boolean) => void;
}

export function FolderRenameDialog({
  folder,
  onOpenChange,
}: FolderRenameDialogProps) {
  const update = useUpdateFolder();
  return (
    <RenameDialog
      open={!!folder}
      onOpenChange={onOpenChange}
      title="Rename folder"
      initialValue={folder?.name ?? ""}
      submitLabel="Rename"
      onSubmit={async (name) => {
        if (!folder) return;
        try {
          const m = await update.mutateAsync({
            id: folder.id,
            patch: { name },
          });
          toast.success(`Renamed to "${m.name}".`);
          onOpenChange(false);
        } catch (e) {
          toast.error(errorMessage(e, "rename failed"));
        }
      }}
    />
  );
}
