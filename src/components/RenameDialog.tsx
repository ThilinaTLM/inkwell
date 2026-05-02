// Generic single-text-field dialog.
//
// Used as both a rename dialog (initialValue prefilled, "Rename" submit
// label) and a create dialog (initialValue blank, "Create" label).
//
// Submitting unchanged text just closes the dialog by default — the
// common case. Pass `allowUnchanged` if the caller needs the submit even
// when the value didn't change.

import { FormEvent, ReactNode, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export interface RenameDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  initialValue: string;
  /** Visible label for the input. Defaults to "Name". */
  label?: string;
  /** Submit button text. Defaults to "Save". */
  submitLabel?: string;
  /** Submit button text while busy. Defaults to "{submitLabel}…" */
  busyLabel?: string;
  /**
   * When false (default) submitting an unchanged value closes the dialog
   * without calling `onSubmit`. Set true for create flows where every
   * submit should fire (e.g. blank initial value).
   */
  allowUnchanged?: boolean;
  onSubmit: (value: string) => Promise<void>;
}

export function RenameDialog({
  open,
  onOpenChange,
  title,
  description,
  initialValue,
  label = "Name",
  submitLabel = "Save",
  busyLabel,
  allowUnchanged = false,
  onSubmit,
}: RenameDialogProps) {
  const [value, setValue] = useState(initialValue);
  const [busy, setBusy] = useState(false);

  // Re-seed when the dialog reopens with a new target.
  useEffect(() => {
    if (open) setValue(initialValue);
  }, [open, initialValue]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const next = value.trim();
    if (!next) return;
    if (!allowUnchanged && next === initialValue.trim()) {
      onOpenChange(false);
      return;
    }
    setBusy(true);
    try {
      await onSubmit(next);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? (
            <DialogDescription>{description}</DialogDescription>
          ) : null}
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="rename-dialog-input">{label}</Label>
            <Input
              id="rename-dialog-input"
              autoFocus
              value={value}
              onChange={(e) => setValue(e.target.value)}
              disabled={busy}
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={busy || !value.trim()}>
              {busy ? busyLabel ?? `${submitLabel}…` : submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
