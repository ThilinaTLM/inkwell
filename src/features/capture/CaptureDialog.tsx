// "Create new" chooser dialog (opened by itemActions.newFile(folderId) when no
// kind is given): Note · Whiteboard · Diagram · HTML site · Upload.

import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { QuickCreate } from "@/features/pages/QuickCreate";

export function CaptureDialog({
  folderId,
  onClose,
}: {
  folderId: string | null;
  onClose: () => void;
}) {
  const [open, setOpen] = useState(true);

  function close() {
    setOpen(false);
    setTimeout(onClose, 150);
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent className="gap-4 p-5 sm:max-w-[520px]">
        <div className="pr-8">
          <DialogTitle className="font-display text-lg font-medium">Create new</DialogTitle>
          <DialogDescription className="text-[13px]">
            {folderId ? "In this folder." : "As a loose file — move it into a project any time."}
          </DialogDescription>
        </div>
        <QuickCreate folderId={folderId} onPick={close} className="sm:grid-cols-2 xl:grid-cols-2" />
      </DialogContent>
    </Dialog>
  );
}
