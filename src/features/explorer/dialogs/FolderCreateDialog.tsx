// Folder create — wraps <RenameDialog> in "create" mode.

import { RenameDialog } from "@/components/RenameDialog";
import { useCreateFolder } from "@/data/folders";
import { useMutationWithToast } from "@/data/useMutationWithToast";

interface FolderCreateDialogProps {
  parentId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function FolderCreateDialog({ parentId, open, onOpenChange }: FolderCreateDialogProps) {
  const run = useMutationWithToast(useCreateFolder(), {
    success: (m) => `Created "${m.name}".`,
    fallback: "could not create folder",
  });
  return (
    <RenameDialog
      open={open}
      onOpenChange={onOpenChange}
      title={parentId ? "New subfolder" : "New folder"}
      description="Folders organize your files. You can nest them."
      initialValue=""
      submitLabel="Create"
      busyLabel="Creating…"
      allowUnchanged
      onSubmit={async (name) => {
        if (await run({ name, parentId })) onOpenChange(false);
      }}
    />
  );
}
