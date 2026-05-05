// File rename — wraps the generic <RenameDialog> with the rename-file
// mutation hook.

import { toast } from "sonner";

import { RenameDialog } from "@/components/RenameDialog";
import { useRenameFile } from "@/data/files";
import type { FileMeta } from "@/lib/api/client";
import { errorMessage } from "@/lib/errors";

interface FileRenameDialogProps {
  file: FileMeta | null;
  onOpenChange: (open: boolean) => void;
}

export function FileRenameDialog({ file, onOpenChange }: FileRenameDialogProps) {
  const rename = useRenameFile();
  return (
    <RenameDialog
      open={!!file}
      onOpenChange={onOpenChange}
      title="Rename file"
      description="Give your file a more memorable name."
      initialValue={file?.name ?? ""}
      submitLabel="Rename"
      onSubmit={async (name) => {
        if (!file) return;
        try {
          const updated = await rename.mutateAsync({ id: file.id, name });
          toast.success(`Renamed to "${updated.name}".`);
          onOpenChange(false);
        } catch (e) {
          toast.error(errorMessage(e, "rename failed"));
        }
      }}
    />
  );
}
