// Global quick-capture dialog (opened by `N`, the "+" in the mobile bar and
// the "New" menu). Target = the current project / folder, else the Inbox,
// and can be changed with the folder picker.

import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { CaptureBox } from "./CaptureBox";
import { DestinationMenu } from "./DestinationMenu";

export function CaptureDialog({
  folderId: initialFolderId,
  onClose,
}: {
  folderId: string | null;
  onClose: () => void;
}) {
  const [open, setOpen] = useState(true);
  const [folderId, setFolderId] = useState<string | null>(initialFolderId);

  function close() {
    setOpen(false);
    setTimeout(onClose, 150);
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent className="gap-3 p-4 sm:max-w-[560px]">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 pr-8">
          <DialogTitle className="font-display text-lg font-medium">Capture</DialogTitle>
          <DialogDescription className="flex min-w-0 items-center gap-1.5 text-[13px]">
            Saving to
            <DestinationMenu value={folderId} onChange={setFolderId} />
          </DialogDescription>
        </div>
        <CaptureBox folderId={folderId} variant="dialog" autoFocus onDone={close} />
      </DialogContent>
    </Dialog>
  );
}
