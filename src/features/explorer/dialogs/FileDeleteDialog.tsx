// File delete confirmation — wraps the generic <ConfirmDialog>.

import { toast } from "sonner";

import { ConfirmDialog } from "@/components/ConfirmDialog";
import { useDeleteFile } from "@/features/explorer/hooks";
import type { FileMeta } from "@/lib/api/client";
import { errorMessage } from "@/lib/errors";

interface FileDeleteDialogProps {
  file: FileMeta | null;
  onOpenChange: (open: boolean) => void;
}

export function FileDeleteDialog({ file, onOpenChange }: FileDeleteDialogProps) {
  const remove = useDeleteFile();
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
        try {
          await remove.mutateAsync(file.id);
          toast.success(`Deleted "${file.name}".`);
          onOpenChange(false);
        } catch (e) {
          toast.error(errorMessage(e, "delete failed"));
        }
      }}
    />
  );
}
