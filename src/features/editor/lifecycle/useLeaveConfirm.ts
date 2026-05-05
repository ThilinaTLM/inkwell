// In-app navigation guard: surfaces a Stay / Discard / Save & Leave
// dialog when the user clicks the editor's "back" button while the
// save lifecycle is dirty.
//
// `<BrowserRouter>` (rather than the data router) means `useBlocker`
// isn't available, so we wrap the only in-app exit point — the back
// button — and let the dialog drive the continuation. Tab close /
// hard reload still use the native `beforeunload` prompt.

import { useCallback, useRef, useState } from "react";

export type LeaveBusyState = false | "save";

export interface UseLeaveConfirmOptions {
  isDirty: boolean;
  saveNow: () => Promise<boolean>;
  discardPendingLocalWork: () => void;
}

export interface UseLeaveConfirmResult {
  open: boolean;
  busy: LeaveBusyState;
  /** Editor calls this from its back-button handler. If clean,
   *  `cont()` runs immediately; otherwise the dialog opens with the
   *  continuation queued. */
  requestLeave: (cont: () => void) => void;
  /** Bound to the dialog's onOpenChange — closes if not in flight. */
  onOpenChange: (open: boolean) => void;
  /** Stay button (alias for onOpenChange(false)). */
  cancel: () => void;
  /** Discard button: drop pending edits and run the queued continuation. */
  discard: () => void;
  /** Save & Leave button: persist, then run the queued continuation
   *  (or stay open if the save errored). */
  saveAndLeave: () => Promise<void>;
}

export function useLeaveConfirm(opts: UseLeaveConfirmOptions): UseLeaveConfirmResult {
  const { isDirty, saveNow, discardPendingLocalWork } = opts;
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<LeaveBusyState>(false);
  const pendingRef = useRef<(() => void) | null>(null);

  const requestLeave = useCallback(
    (cont: () => void) => {
      if (!isDirty) {
        cont();
        return;
      }
      pendingRef.current = cont;
      setOpen(true);
    },
    [isDirty],
  );

  const cancel = useCallback(() => {
    if (busy) return;
    pendingRef.current = null;
    setOpen(false);
  }, [busy]);

  const onOpenChange = useCallback(
    (next: boolean) => {
      if (!next) cancel();
    },
    [cancel],
  );

  const discard = useCallback(() => {
    discardPendingLocalWork();
    setBusy(false);
    setOpen(false);
    const cont = pendingRef.current;
    pendingRef.current = null;
    cont?.();
  }, [discardPendingLocalWork]);

  const saveAndLeave = useCallback(async () => {
    setBusy("save");
    const ok = await saveNow();
    if (!ok) {
      // Save failed — leave the dialog open so the user can pick
      // another action (Stay / Discard).
      setBusy(false);
      return;
    }
    setBusy(false);
    setOpen(false);
    const cont = pendingRef.current;
    pendingRef.current = null;
    cont?.();
  }, [saveNow]);

  return { open, busy, requestLeave, onOpenChange, cancel, discard, saveAndLeave };
}
