// Stay / Discard / Save & Leave dialog shared by both editors.
//
// Behavior is identical between Excalidraw and Drawio (same copy,
// same disabled-while-busy semantics, same button order); the
// duplicate AlertDialog blocks in each editor went here.

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import type { LeaveBusyState } from "./useLeaveConfirm";

interface LeaveConfirmDialogProps {
  open: boolean;
  busy: LeaveBusyState;
  onOpenChange: (open: boolean) => void;
  onDiscard: () => void;
  onSaveAndLeave: () => void;
}

export function LeaveConfirmDialog({
  open,
  busy,
  onOpenChange,
  onDiscard,
  onSaveAndLeave,
}: LeaveConfirmDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Leave with unsaved changes?</AlertDialogTitle>
          <AlertDialogDescription>
            Your latest edits haven't been saved yet. If you leave now they may be lost.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={!!busy}>Stay</AlertDialogCancel>
          <Button variant="destructive" onClick={onDiscard} disabled={!!busy}>
            Discard
          </Button>
          <Button onClick={onSaveAndLeave} disabled={!!busy}>
            {busy ? "Saving…" : "Save & Leave"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
