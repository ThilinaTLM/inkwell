// Folder create — wraps <RenameDialog> in "create" mode.

import { toast } from "sonner";

import { RenameDialog } from "@/components/RenameDialog";
import { useCreateFolder } from "@/features/explorer/hooks";
import { errorMessage } from "@/lib/errors";

interface FolderCreateDialogProps {
  parentId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function FolderCreateDialog({
  parentId,
  open,
  onOpenChange,
}: FolderCreateDialogProps) {
  const create = useCreateFolder();
  return (
    <RenameDialog
      open={open}
      onOpenChange={onOpenChange}
      title={parentId ? "New subfolder" : "New folder"}
      description="Folders organize your scenes. You can nest them."
      initialValue=""
      submitLabel="Create"
      busyLabel="Creating…"
      allowUnchanged
      onSubmit={async (name) => {
        try {
          const m = await create.mutateAsync({ name, parentId });
          toast.success(`Created "${m.name}".`);
          onOpenChange(false);
        } catch (e) {
          toast.error(errorMessage(e, "could not create folder"));
        }
      }}
    />
  );
}
