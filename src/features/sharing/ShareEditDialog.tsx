// Edit one share link: label, access, expiry, downloads. Saves with undo.
//
//   <ShareEditDialog share targetKind? targetName? open onOpenChange />

import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useId, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from "@/components/ui/dialog";
import type { FileKind, Share } from "@/lib/api/client";
import { AllowDownloadField } from "./fields/AllowDownloadField";
import { ExpiryChips, type ExpiryChoice } from "./fields/ExpiryChips";
import { LabelField } from "./fields/LabelField";
import { PermissionSegment } from "./fields/PermissionSegment";
import { type SharePatch, updateShareWithUndo } from "./shareActions";
import { presetToExpiresAt } from "./shareStatus";

const DAY = 86_400_000;

function initialExpiry(share: Share): ExpiryChoice | null {
  return share.expiresAt === null ? "never" : "custom";
}

export function ShareEditDialog({
  share,
  targetName,
  targetKind,
  open,
  onOpenChange,
}: {
  share: Share;
  targetName: string;
  targetKind?: FileKind;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const qc = useQueryClient();
  const labelId = useId();
  const locked = share.targetType === "file" && targetKind === "static-site";
  const [label, setLabel] = useState(share.label ?? "");
  const [permission, setPermission] = useState(share.permission);
  const [allowDownload, setAllowDownload] = useState(share.allowDownload);
  const [expiry, setExpiry] = useState<ExpiryChoice | null>(initialExpiry(share));
  const [customAt, setCustomAt] = useState<number | null>(share.expiresAt);

  useEffect(() => {
    if (!open) return;
    setLabel(share.label ?? "");
    setPermission(share.permission);
    setAllowDownload(share.allowDownload);
    setExpiry(initialExpiry(share));
    setCustomAt(share.expiresAt);
  }, [open, share]);

  function save() {
    const patch: SharePatch = {};
    const nextLabel = label.trim() || null;
    if (nextLabel !== (share.label ?? null)) patch.label = nextLabel;
    if (permission !== share.permission) patch.permission = permission;
    const dl = permission === "write" ? true : allowDownload;
    if (dl !== share.allowDownload) patch.allowDownload = dl;
    const nextExpiry =
      expiry === "custom"
        ? customAt
        : expiry === null
          ? share.expiresAt
          : presetToExpiresAt(expiry, Date.now());
    // Untouched custom expiry keeps its exact timestamp.
    if (nextExpiry !== share.expiresAt) patch.expiresAt = nextExpiry;
    onOpenChange(false);
    if (Object.keys(patch).length) void updateShareWithUndo(qc, share, patch, "Link updated");
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="gap-0 p-5 sm:max-w-[460px]"
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            save();
          }
        }}
      >
        <DialogTitle className="font-display text-xl font-medium">Edit link</DialogTitle>
        <DialogDescription className="mt-1 truncate text-[13px]">{targetName}</DialogDescription>
        <div className="mt-5 grid grid-cols-[88px_1fr] items-start gap-x-3 gap-y-4">
          <label htmlFor={labelId} className="pt-2 text-xs text-muted-foreground">
            Label
          </label>
          <LabelField id={labelId} value={label} onChange={setLabel} autoFocus />
          <span className="pt-1.5 text-xs text-muted-foreground">Access</span>
          <div>
            <PermissionSegment
              value={locked ? "read" : permission}
              onChange={setPermission}
              lockedToRead={locked}
            />
          </div>
          <span className="pt-1.5 text-xs text-muted-foreground">Expires</span>
          <ExpiryChips
            value={expiry}
            onChange={(id) => {
              setExpiry(id);
              if (id === "custom" && (!customAt || customAt < Date.now()))
                setCustomAt(Date.now() + 3 * DAY);
            }}
            allowCustom
            customAt={customAt}
            onCustomAt={setCustomAt}
          />
          <span className="pt-1.5 text-xs text-muted-foreground">Downloads</span>
          <div>
            <AllowDownloadField
              permission={locked ? "read" : permission}
              value={allowDownload}
              onChange={setAllowDownload}
            />
          </div>
        </div>
        <DialogFooter className="mt-6">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={save}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
