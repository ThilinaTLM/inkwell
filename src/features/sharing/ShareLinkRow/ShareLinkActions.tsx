// Row-level "edit / rotate / revoke" action cluster + the matching
// confirm dialogs. Lives next to the row so the dialog copy stays
// near the buttons that trigger it.
//
// Pure presentational: the parent row owns the actual mutation
// handlers (and the toasts they surface), this component only owns
// the confirm-dialog open/close state.

import { Delete02Icon, Refresh01Icon, Settings02Icon } from "@hugeicons/core-free-icons";
import { useState } from "react";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { IconAction } from "./IconAction";

export interface ShareLinkActionsProps {
  onEditClick: () => void;
  /** Runs the rotate mutation. Should surface its own toast. */
  onRotate: () => Promise<void>;
  /** Runs the revoke mutation. Should surface its own toast. */
  onRevoke: () => Promise<void>;
}

export function ShareLinkActions({ onEditClick, onRotate, onRevoke }: ShareLinkActionsProps) {
  const [confirmRotate, setConfirmRotate] = useState(false);
  const [confirmRevoke, setConfirmRevoke] = useState(false);

  return (
    <>
      <div className="flex items-center gap-0.5">
        <IconAction icon={Settings02Icon} label="Edit" onClick={onEditClick} />
        <IconAction
          icon={Refresh01Icon}
          label="Rotate (replace URL)"
          onClick={() => setConfirmRotate(true)}
        />
        <IconAction
          icon={Delete02Icon}
          label="Revoke"
          destructive
          onClick={() => setConfirmRevoke(true)}
        />
      </div>

      <ConfirmDialog
        open={confirmRotate}
        onOpenChange={setConfirmRotate}
        title="Replace this link?"
        description="The current URL stops working immediately. A new URL with the same settings will be created and copied to your clipboard."
        confirmLabel="Replace link"
        busyLabel="Replacing…"
        variant="default"
        onConfirm={onRotate}
      />
      <ConfirmDialog
        open={confirmRevoke}
        onOpenChange={setConfirmRevoke}
        title="Revoke this link?"
        description="The URL stops working immediately and cannot be restored. Anyone with the link will lose access."
        confirmLabel="Revoke"
        busyLabel="Revoking…"
        onConfirm={onRevoke}
      />
    </>
  );
}
