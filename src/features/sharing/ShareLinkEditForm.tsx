// Inline edit form for an existing share link.
//
// Used by `ShareLinkRow` when the user clicks the gear icon. Mirrors the
// "Create new link" form (same field components) so the two flows feel
// identical, but with two extra concepts:
//
//   • "Keep current" expiry chip — leaves `expires_at` untouched. This is
//     the default; the user has to click another chip to change the
//     expiry.
//   • Diffs against the current share before submitting — only changed
//     fields are sent in the PATCH body.
//
// The form is self-contained and does not invoke any mutation directly;
// it calls `onSave(patch)` and waits for the promise. The parent row is
// responsible for surfacing toasts and closing the form.

import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { Share, SharePermission } from "@/lib/api/client";
import { AllowDownloadField } from "./fields/AllowDownloadField";
import { ExpiryChips, type ExpiryOption } from "./fields/ExpiryChips";
import { LabelField } from "./fields/LabelField";
import { PermissionSegment } from "./fields/PermissionSegment";

/** Patch sent to the worker — every field optional. `null` clears
 *  nullable fields; `undefined` leaves them alone. */
export interface ShareLinkEditPatch {
  permission?: SharePermission;
  allowDownload?: boolean;
  expiresAt?: number | null;
  label?: string | null;
}

type ExpiryChoice = "keep" | "never" | "1d" | "7d" | "30d";

const EXPIRY_OFFSETS: Record<Exclude<ExpiryChoice, "keep" | "never">, number> = {
  "1d": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
  "30d": 30 * 24 * 60 * 60 * 1000,
};

const EXPIRY_OPTIONS: ExpiryOption[] = [
  { id: "keep", label: "Keep current" },
  { id: "never", label: "Never" },
  { id: "1d", label: "1 day" },
  { id: "7d", label: "7 days" },
  { id: "30d", label: "30 days" },
];

export function ShareLinkEditForm({
  share,
  onCancel,
  onSave,
}: {
  share: Share;
  onCancel: () => void;
  onSave: (patch: ShareLinkEditPatch) => Promise<void>;
}) {
  const [perm, setPerm] = useState<SharePermission>(share.permission);
  const [allowDownload, setAllowDownload] = useState<boolean>(share.allowDownload);
  const [expiry, setExpiry] = useState<ExpiryChoice>("keep");
  const [label, setLabel] = useState<string>(share.label ?? "");
  const [busy, setBusy] = useState(false);

  function buildPatch(): ShareLinkEditPatch {
    const patch: ShareLinkEditPatch = {};
    if (perm !== share.permission) patch.permission = perm;
    // Only the read-permission case meaningfully toggles allow_download;
    // server forces true for write shares, so don't bother sending.
    if (perm === "read" && allowDownload !== share.allowDownload) {
      patch.allowDownload = allowDownload;
    }
    if (expiry === "never") {
      if (share.expiresAt !== null) patch.expiresAt = null;
    } else if (expiry !== "keep") {
      patch.expiresAt = Date.now() + EXPIRY_OFFSETS[expiry];
    }
    const trimmedLabel = label.trim();
    const currentLabel = share.label ?? "";
    if (trimmedLabel !== currentLabel) {
      patch.label = trimmedLabel.length === 0 ? null : trimmedLabel;
    }
    return patch;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    const patch = buildPatch();
    if (Object.keys(patch).length === 0) {
      onCancel();
      return;
    }
    setBusy(true);
    try {
      await onSave(patch);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-4 rounded-lg bg-muted/30 p-4 ring-1 ring-border/50"
    >
      <PermissionSegment value={perm} onChange={setPerm} />
      <AllowDownloadField permission={perm} value={allowDownload} onChange={setAllowDownload} />
      <ExpiryChips
        options={EXPIRY_OPTIONS}
        value={expiry}
        onChange={(id) => setExpiry(id as ExpiryChoice)}
        smGridCols="sm:grid-cols-5"
      />
      <LabelField value={label} onChange={setLabel} />

      <div className="flex flex-wrap items-center justify-end gap-1.5">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={busy}>
          {busy ? "Saving…" : "Save changes"}
        </Button>
      </div>
    </form>
  );
}
