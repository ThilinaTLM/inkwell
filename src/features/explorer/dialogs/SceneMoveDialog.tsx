// Scene move — wraps <MoveToFolderDialog> with the explorer's
// move-scene mutation.

import { toast } from "sonner";

import { MoveToFolderDialog } from "@/features/folders/MoveToFolderDialog";
import { useMoveScene } from "@/features/explorer/hooks";
import type { FolderMeta, SceneMeta } from "@/lib/api/client";
import { errorMessage } from "@/lib/errors";

interface SceneMoveDialogProps {
  scene: SceneMeta | null;
  folders: FolderMeta[];
  onOpenChange: (open: boolean) => void;
}

export function SceneMoveDialog({
  scene,
  folders,
  onOpenChange,
}: SceneMoveDialogProps) {
  const move = useMoveScene();
  if (!scene) return null;
  return (
    <MoveToFolderDialog
      open
      onOpenChange={onOpenChange}
      folders={folders}
      initialId={scene.folderId}
      title={`Move "${scene.name}"`}
      description="Pick a destination folder, or choose Top level for the root."
      onSubmit={async (destFolderId) => {
        try {
          await move.mutateAsync({ id: scene.id, folderId: destFolderId });
          toast.success("Moved.");
          onOpenChange(false);
        } catch (e) {
          toast.error(errorMessage(e, "could not move"));
        }
      }}
    />
  );
}
