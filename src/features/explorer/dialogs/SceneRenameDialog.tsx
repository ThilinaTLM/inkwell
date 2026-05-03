// Scene rename — wraps the generic <RenameDialog> with the rename-scene
// mutation hook.

import { toast } from "sonner";

import { RenameDialog } from "@/components/RenameDialog";
import { useRenameScene } from "@/features/explorer/hooks";
import type { SceneMeta } from "@/lib/api/client";
import { errorMessage } from "@/lib/errors";

interface SceneRenameDialogProps {
  scene: SceneMeta | null;
  onOpenChange: (open: boolean) => void;
}

export function SceneRenameDialog({ scene, onOpenChange }: SceneRenameDialogProps) {
  const rename = useRenameScene();
  return (
    <RenameDialog
      open={!!scene}
      onOpenChange={onOpenChange}
      title="Rename scene"
      description="Give your scene a more memorable name."
      initialValue={scene?.name ?? ""}
      submitLabel="Rename"
      onSubmit={async (name) => {
        if (!scene) return;
        try {
          const updated = await rename.mutateAsync({ id: scene.id, name });
          toast.success(`Renamed to "${updated.name}".`);
          onOpenChange(false);
        } catch (e) {
          toast.error(errorMessage(e, "rename failed"));
        }
      }}
    />
  );
}
