// File rename — wraps the generic <RenameDialog> with the rename-file
// mutation hook.

import { RenameDialog } from "@/components/RenameDialog";
import { useRenameFile } from "@/data/files";
import { useMutationWithToast } from "@/data/useMutationWithToast";
import type { FileMeta } from "@/lib/api/client";

interface FileRenameDialogProps {
  file: FileMeta | null;
  onOpenChange: (open: boolean) => void;
}

export function FileRenameDialog({ file, onOpenChange }: FileRenameDialogProps) {
  const run = useMutationWithToast(useRenameFile(), {
    success: (updated) => `Renamed to "${updated.name}".`,
    fallback: "rename failed",
  });
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
        if (await run({ id: file.id, name })) onOpenChange(false);
      }}
    />
  );
}
