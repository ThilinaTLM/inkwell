// The old kind picker + naming flow is gone: "new file" now opens the quick
// "Create new" chooser (Note / Whiteboard / Diagram / HTML site / Upload). New
// files get default names and open straight away; rename in the editor.

import { CaptureDialog } from "@/features/capture/CaptureDialog";

export function NewFileDialog({
  folderId,
  onClose,
}: {
  folderId: string | null;
  kind?: unknown;
  onClose: () => void;
}) {
  return <CaptureDialog folderId={folderId} onClose={onClose} />;
}
