// Editor's "Rename scene" dialog.
//
// Wraps the generic <RenameDialog>; the editor doesn't use the
// useRenameScene hook directly because the editor must also update its
// local working copy after the rename succeeds, so it owns the submit
// callback.

import { RenameDialog } from "@/components/RenameDialog";

interface RenameSceneDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentName: string;
  onRename: (next: string) => Promise<void>;
}

export function RenameSceneDialog({
  open,
  onOpenChange,
  currentName,
  onRename,
}: RenameSceneDialogProps) {
  return (
    <RenameDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Rename scene"
      description="This is what you'll see on the dashboard."
      initialValue={currentName}
      submitLabel="Save"
      onSubmit={onRename}
    />
  );
}
