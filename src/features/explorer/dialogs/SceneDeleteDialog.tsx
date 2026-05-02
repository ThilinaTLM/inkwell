// Scene delete confirmation — wraps the generic <ConfirmDialog>.

import { toast } from "sonner";

import { ConfirmDialog } from "@/components/ConfirmDialog";
import { useDeleteScene } from "@/features/explorer/hooks";
import type { SceneMeta } from "@/lib/api/client";
import { errorMessage } from "@/lib/errors";

interface SceneDeleteDialogProps {
  scene: SceneMeta | null;
  onOpenChange: (open: boolean) => void;
}

export function SceneDeleteDialog({
  scene,
  onOpenChange,
}: SceneDeleteDialogProps) {
  const remove = useDeleteScene();
  return (
    <ConfirmDialog
      open={!!scene}
      onOpenChange={onOpenChange}
      title="Delete scene?"
      description={
        <>
          "{scene?.name}" will be permanently removed. This cannot be undone.
        </>
      }
      confirmLabel="Delete"
      busyLabel="Deleting…"
      onConfirm={async () => {
        if (!scene) return;
        try {
          await remove.mutateAsync(scene.id);
          toast.success(`Deleted "${scene.name}".`);
          onOpenChange(false);
        } catch (e) {
          toast.error(errorMessage(e, "delete failed"));
        }
      }}
    />
  );
}
