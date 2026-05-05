// ShareLinkRow — one row in the active-shares list.
//
// Used by both the per-target `<ShareDialog>` and the global `/shares`
// management page. Renders a single share token as a card with:
//
//   • Permission badge (View / Edit) and an optional Download badge.
//   • Optional label (or "Untitled link" if none).
//   • The full share URL with a copy-to-clipboard button.
//   • Meta line: created, expires (with countdown if within 7d), last
//     opened.
//   • Action icon buttons: Copy / Edit / Rotate / Revoke.
//
// In edit mode the row swaps the meta + actions area for an inline form
// that mutates the same token in place. Rotate is gated by an
// AlertDialog confirm because it invalidates the URL.
//
// Layout reflows on small screens (`<sm`): badges stack above the URL,
// actions wrap onto their own row, the URL takes full width.

import { Copy01Icon, Download01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import type { Share } from "@/lib/api/client";
import { copyToClipboard } from "@/lib/clipboard";
import { errorMessage } from "@/lib/errors";
import { expiresPhrase, fmtDateTime, relTime, truncateMiddle } from "@/lib/format";
import { shareUrl } from "@/lib/url";
import { cn } from "@/lib/utils";
import { ShareLinkEditForm, type ShareLinkEditPatch } from "./ShareLinkEditForm";
import { IconAction } from "./ShareLinkRow/IconAction";
import { PermissionBadge } from "./ShareLinkRow/PermissionBadge";
import { ShareLinkActions } from "./ShareLinkRow/ShareLinkActions";

export interface ShareLinkRowProps {
  share: Share;
  /** Edit-in-place mutation. Resolves with the updated share. */
  onEdit: (patch: ShareLinkEditPatch) => Promise<void>;
  /** Rotate this token: revoke + reissue with the same settings. The
   *  hook is responsible for copying the new URL to clipboard. */
  onRotate: () => Promise<{ newToken: string }>;
  /** Revoke this token outright. */
  onRevoke: () => Promise<void>;
  /** Optional class name for the outer card. */
  className?: string;
}

export function ShareLinkRow({ share, onEdit, onRotate, onRevoke, className }: ShareLinkRowProps) {
  const [editing, setEditing] = useState(false);

  const url = shareUrl(share.token);
  const expires = expiresPhrase(share.expiresAt);

  async function handleCopy() {
    const ok = await copyToClipboard(url);
    if (ok) toast.success("Copied.");
    else toast.error("Could not copy.");
  }

  async function handleSave(patch: ShareLinkEditPatch) {
    try {
      await onEdit(patch);
      toast.success("Updated.");
      setEditing(false);
    } catch (e) {
      toast.error(errorMessage(e, "could not update"));
    }
  }

  // Rotate has a wrinkle: the toast message depends on whether the
  // post-rotate clipboard write succeeded (some browsers reject it
  // when the page lost focus during the confirm dialog). Keep the
  // wiring inline so that branch stays visible.
  async function handleRotate() {
    try {
      const { newToken } = await onRotate();
      const copied = await copyToClipboard(shareUrl(newToken));
      toast.success(
        copied ? "Replaced and copied — old link revoked." : "Replaced — old link revoked.",
      );
    } catch (e) {
      toast.error(errorMessage(e, "could not rotate"));
    }
  }

  async function handleRevoke() {
    try {
      await onRevoke();
      toast.success("Revoked.");
    } catch (e) {
      toast.error(errorMessage(e, "could not revoke"));
    }
  }

  return (
    <li
      className={cn(
        "group/row relative flex flex-col gap-3 rounded-xl bg-card p-4 ring-1 ring-border/60 shadow-[0_2px_8px_-4px_rgba(28,24,20,0.08)] transition-shadow hover:shadow-[0_6px_16px_-8px_rgba(28,24,20,0.18)]",
        className,
      )}
    >
      {/* Header: badges + label */}
      <div className="flex flex-wrap items-center gap-2">
        <PermissionBadge permission={share.permission} />
        {share.allowDownload && share.permission === "read" ? (
          <Badge variant="outline" className="gap-1">
            <HugeiconsIcon icon={Download01Icon} strokeWidth={2} />
            Download
          </Badge>
        ) : null}
        <span
          className={cn(
            "min-w-0 flex-1 truncate text-sm font-medium",
            share.label ? "text-foreground" : "text-muted-foreground italic",
          )}
        >
          {share.label || "Untitled link"}
        </span>
      </div>

      {/* URL row */}
      <div className="flex items-center gap-2 rounded-md bg-muted/40 px-3 py-2 ring-1 ring-border/40">
        <code className="min-w-0 flex-1 truncate font-sans text-xs text-foreground/80">
          <span className="hidden sm:inline">{url}</span>
          <span className="sm:hidden">{truncateMiddle(url, 36)}</span>
        </code>
        <IconAction icon={Copy01Icon} label="Copy link" onClick={handleCopy} />
      </div>

      {/* Edit form OR meta+actions */}
      {editing ? (
        <ShareLinkEditForm share={share} onCancel={() => setEditing(false)} onSave={handleSave} />
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
            <span title={fmtDateTime(share.createdAt)}>created {relTime(share.createdAt)}</span>
            {expires && share.expiresAt !== null ? (
              <>
                <span aria-hidden>·</span>
                <span
                  className={cn(
                    expires === "expired" || expires.startsWith("expires in")
                      ? "text-destructive/80"
                      : undefined,
                  )}
                  title={fmtDateTime(share.expiresAt)}
                >
                  {expires}
                </span>
              </>
            ) : null}
            {share.lastAccessedAt ? (
              <>
                <span aria-hidden>·</span>
                <span title={fmtDateTime(share.lastAccessedAt)}>
                  last opened {relTime(share.lastAccessedAt)}
                </span>
              </>
            ) : (
              <>
                <span aria-hidden>·</span>
                <span>never opened</span>
              </>
            )}
          </div>
          <ShareLinkActions
            onEditClick={() => setEditing(true)}
            onRotate={handleRotate}
            onRevoke={handleRevoke}
          />
        </div>
      )}
    </li>
  );
}
