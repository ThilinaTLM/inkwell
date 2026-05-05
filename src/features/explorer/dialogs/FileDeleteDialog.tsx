// File delete confirmation — wraps the generic <ConfirmDialog>.

import { ConfirmDialog } from "@/components/ConfirmDialog";
import { useDeleteFile } from "@/data/files";
import { useMutationWithToast } from "@/data/useMutationWithToast";
import type { FileMeta } from "@/lib/api/client";

interface FileDeleteDialogProps {
  file: FileMeta | null;
  onOpenChange: (open: boolean) => void;
}

export function FileDeleteDialog({ file, onOpenChange }: FileDeleteDialogProps) {
  const run = useMutationWithToast(useDeleteFile(), {
    success: () => `Deleted "${file?.name ?? ""}".`,
    fallback: "delete failed",
  });
  return (
    <ConfirmDialog
      open={!!file}
      onOpenChange={onOpenChange}
      title="Delete file?"
      description={<>"{file?.name}" will be permanently removed. This cannot be undone.</>}
      confirmLabel="Delete"
      busyLabel="Deleting…"
      onConfirm={async () => {
        if (!file) return;
        if (await run(file.id)) onOpenChange(false);
      }}
    />
  );
}
