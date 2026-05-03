// Inline edit form for an existing share link.
//
// Used by `ShareLinkRow` when the user clicks the gear icon. Mirrors the
// "Create new link" form so the two flows feel identical, but with two
// extra concepts:
//
//   • "Keep current" expiry chip — leaves `expires_at` untouched. This is
//     the default; the user has to click another chip (or "Custom") to
//     change the expiry.
//   • Diffs against the current share before submitting — only changed
//     fields are sent in the PATCH body.
//
// The form is self-contained and does not invoke any mutation directly;
// it calls `onSave(patch)` and waits for the promise. The parent row is
// responsible for surfacing toasts and closing the form.

import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Share, SharePermission } from "@/lib/api/client";
import { cn } from "@/lib/utils";

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
  const downloadId = useId();
  const labelId = useId();

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
      {/* Permission segmented control */}
      <div className="grid grid-cols-2 gap-2">
        <PermSegment
          active={perm === "read"}
          onClick={() => setPerm("read")}
          title="View only"
          subtitle="Read-only access."
        />
        <PermSegment
          active={perm === "write"}
          onClick={() => setPerm("write")}
          title="Can edit"
          subtitle="Read-write access."
        />
      </div>

      {/* Allow download */}
      <label
        htmlFor={downloadId}
        className={cn(
          "flex items-center gap-2 text-sm",
          perm === "write" && "text-muted-foreground",
        )}
      >
        <input
          id={downloadId}
          type="checkbox"
          className="size-4"
          checked={perm === "write" ? true : allowDownload}
          disabled={perm === "write"}
          onChange={(e) => setAllowDownload(e.target.checked)}
        />
        Allow download (.excalidraw)
      </label>

      {/* Expiry chips */}
      <div className="flex flex-col gap-2">
        <Label>Expires</Label>
        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-5">
          <ExpiryChip
            label="Keep current"
            active={expiry === "keep"}
            onClick={() => setExpiry("keep")}
          />
          <ExpiryChip
            label="Never"
            active={expiry === "never"}
            onClick={() => setExpiry("never")}
          />
          <ExpiryChip label="1 day" active={expiry === "1d"} onClick={() => setExpiry("1d")} />
          <ExpiryChip label="7 days" active={expiry === "7d"} onClick={() => setExpiry("7d")} />
          <ExpiryChip label="30 days" active={expiry === "30d"} onClick={() => setExpiry("30d")} />
        </div>
      </div>

      {/* Label */}
      <div className="flex flex-col gap-2">
        <Label htmlFor={labelId}>Label (optional)</Label>
        <Input
          id={labelId}
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="e.g. Q4 review"
          maxLength={200}
        />
      </div>

      {/* Actions */}
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

function PermSegment({
  active,
  onClick,
  title,
  subtitle,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  subtitle: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-active={active}
      className="rounded-md border border-border bg-background px-3 py-2.5 text-left transition-colors data-[active=true]:border-ring data-[active=true]:bg-accent data-[active=true]:text-accent-foreground hover:bg-accent/40"
    >
      <div className="text-sm font-medium">{title}</div>
      <div className="text-xs text-muted-foreground">{subtitle}</div>
    </button>
  );
}

function ExpiryChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-active={active}
      className="rounded-md border border-border bg-background px-3 py-1.5 text-xs transition-colors data-[active=true]:border-ring data-[active=true]:bg-accent data-[active=true]:text-accent-foreground hover:bg-accent/40"
    >
      {label}
    </button>
  );
}
