// Editor's "Rename file" dialog.
//
// Wraps the generic <RenameDialog>; the editor doesn't use the
// useRenameFile hook directly because the editor must also update its
// local working copy after the rename succeeds, so it owns the submit
// callback.

import { RenameDialog } from "@/components/RenameDialog";

interface RenameFileDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentName: string;
  onRename: (next: string) => Promise<void>;
}

export function RenameFileDialog({
  open,
  onOpenChange,
  currentName,
  onRename,
}: RenameFileDialogProps) {
  return (
    <RenameDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Rename file"
      description="This is what you'll see on the dashboard."
      initialValue={currentName}
      submitLabel="Save"
      onSubmit={onRename}
    />
  );
}
