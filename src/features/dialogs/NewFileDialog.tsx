// The old kind picker + naming flow is gone: "new file" now opens the quick
// Capture dialog (text → note; Note / Whiteboard / Diagram / Upload). New
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
