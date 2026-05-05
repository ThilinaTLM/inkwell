// File move — wraps <MoveToFolderDialog> with the explorer's
// move-file mutation.

import { useMoveFile } from "@/data/files";
import { useMutationWithToast } from "@/data/useMutationWithToast";
import { MoveToFolderDialog } from "@/features/folders/MoveToFolderDialog";
import type { FileMeta, FolderMeta } from "@/lib/api/client";

interface FileMoveDialogProps {
  file: FileMeta | null;
  folders: FolderMeta[];
  onOpenChange: (open: boolean) => void;
}

export function FileMoveDialog({ file, folders, onOpenChange }: FileMoveDialogProps) {
  const run = useMutationWithToast(useMoveFile(), {
    success: "Moved.",
    fallback: "could not move",
  });
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
        if (await run({ id: file.id, folderId: destFolderId })) onOpenChange(false);
      }}
    />
  );
}
