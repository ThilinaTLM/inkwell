// Generic confirm dialog for destructive actions.
//
// Replaces the SceneDeleteDialog and FolderDeleteDialog scaffolding in
// pages/Dashboard.tsx and the user-delete confirmation in Admin.tsx
// (note: Admin's variant also asks for a typed phrase — that flow keeps
// its own dialog; this primitive covers the "are you sure?" case).

import { ReactNode, useState } from "react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description: ReactNode;
  /** Submit button label. Defaults to "Confirm". */
  confirmLabel?: string;
  /** Submit button label while running. Defaults to "{confirmLabel}…" */
  busyLabel?: string;
  /** Affects the action button styling. Defaults to "destructive". */
  variant?: "destructive" | "default";
  onConfirm: () => Promise<void> | void;
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Confirm",
  busyLabel,
  variant = "destructive",
  onConfirm,
}: ConfirmDialogProps) {
  const [busy, setBusy] = useState(false);

  async function handleConfirm() {
    setBusy(true);
    try {
      await onConfirm();
    } finally {
      setBusy(false);
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant={variant}
            onClick={(e) => {
              // Prevent the AlertDialog's default close-on-action so we can
              // keep the busy state visible while the mutation runs.
              e.preventDefault();
              void handleConfirm();
            }}
            disabled={busy}
          >
            {busy ? busyLabel ?? `${confirmLabel}…` : confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
