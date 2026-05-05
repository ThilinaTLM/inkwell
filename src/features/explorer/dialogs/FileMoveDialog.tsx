// File move — wraps <MoveToFolderDialog> with the explorer's
// move-file mutation.

import { toast } from "sonner";
import { useMoveFile } from "@/data/files";
import { MoveToFolderDialog } from "@/features/folders/MoveToFolderDialog";
import type { FileMeta, FolderMeta } from "@/lib/api/client";
import { errorMessage } from "@/lib/errors";

interface FileMoveDialogProps {
  file: FileMeta | null;
  folders: FolderMeta[];
  onOpenChange: (open: boolean) => void;
}

export function FileMoveDialog({ file, folders, onOpenChange }: FileMoveDialogProps) {
  const move = useMoveFile();
  if (!file) return null;
  return (
    <MoveToFolderDialog
      open
      onOpenChange={onOpenChange}
      folders={folders}
      initialId={file.folderId}
      title={`Move "${file.name}"`}
      description="Pick a destination folder, or choose Top level for the root."
      onSubmit={async (destFolderId) => {
        try {
          await move.mutateAsync({ id: file.id, folderId: destFolderId });
          toast.success("Moved.");
          onOpenChange(false);
        } catch (e) {
          toast.error(errorMessage(e, "could not move"));
        }
      }}
    />
  );
}
