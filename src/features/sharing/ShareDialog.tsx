// Unified share dialog. Works for both scene and folder targets.
//
// Visual structure:
//
//   ┌─ Dialog (paper card, no nested borders) ───────────────────┐
//   │ Header   Share "<targetName>"                              │
//   │          <muted hint that adapts to current selection>     │
//   │                                                            │
//   │ Active links section                                       │
//   │   • If empty: muted "No active links yet."                 │
//   │   • Else: list of <ShareLinkRow> cards.                    │
//   │                                                            │
//   │ Create section                                             │
//   │   • If 0 links: form is expanded by default.               │
//   │   • Else:       collapsed under a "+ New link" button.     │
//   └────────────────────────────────────────────────────────────┘
//
// The previous implementation had a dashed-border inner card AND a
// detached "Done" footer button which read as nested cards in the
// screenshot. Both are gone — close happens via Esc or the built-in
// `✕` button on the dialog.

import { Add01Icon, Link04Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useCreateShare,
  useRevokeShare,
  useRotateShare,
  useShareList,
  useUpdateShare,
} from "@/data/shares";
import type { FileKind, ShareTargetType } from "@/lib/api/client";
import { copyToClipboard } from "@/lib/clipboard";
import { errorMessage } from "@/lib/errors";
import { shareUrl } from "@/lib/url";
import { ShareLinkCreateForm } from "./ShareLinkCreateForm";
import { ShareLinkRow } from "./ShareLinkRow";

interface ShareDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  targetType: ShareTargetType;
  targetId: string;
  targetName: string;
  /** File kind, only meaningful for `targetType === "file"`. Drives
   *  kind-aware UX such as locking the permission selector for
   *  static-site shares (which have no write path). */
  targetKind?: FileKind;
}

export function ShareDialog({
  open,
  onOpenChange,
  targetType,
  targetId,
  targetName,
  targetKind,
}: ShareDialogProps) {
  const lockedToRead = targetType === "file" && targetKind === "static-site";
  const sharesQuery = useShareList(targetType, targetId, open);
  const createShare = useCreateShare(targetType, targetId);
  const updateShare = useUpdateShare(targetType, targetId);
  const rotateShare = useRotateShare(targetType, targetId);
  const revokeShare = useRevokeShare(targetType, targetId);

  // The create section is expanded by default when there are zero
  // existing links (the user is here to make one). Once they have at
  // least one, we collapse it behind a `+ New link` button so the
  // dialog stays calm.
  const [createOpen, setCreateOpen] = useState(false);
  const [resetSignal, setResetSignal] = useState(0);

  const items = sharesQuery.data ?? null;

  useEffect(() => {
    if (!open) return;
    // Reset create-form state on every (re)open.
    setResetSignal((n) => n + 1);
  }, [open]);

  useEffect(() => {
    if (items === null) return;
    setCreateOpen(items.length === 0);
  }, [items]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85dvh] flex-col gap-4 sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <HugeiconsIcon icon={Link04Icon} strokeWidth={2} className="size-4" />
            <span>
              Share{" "}
              {targetType === "folder" ? (
                <span className="font-normal text-muted-foreground">folder</span>
              ) : null}{" "}
              <span className="font-semibold">“{targetName}”</span>
            </span>
          </DialogTitle>
          <DialogDescription>
            {targetType === "folder"
              ? "Anyone with a link can access files inside this folder. Edit links can also create, edit and delete files."
              : lockedToRead
                ? "Anyone with a link can view this site."
                : "Anyone with a link can access this file. Edit links can also save changes back to it."}
          </DialogDescription>
        </DialogHeader>

        {/* Body — scrollable so long lists don't push the dialog off-screen. */}
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto pr-1">
          {/* ── Active links ───────────────────────────────────────── */}
          <section className="flex flex-col gap-2">
            <header className="flex items-center justify-between gap-2">
              <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Active links{items && items.length > 0 ? ` · ${items.length}` : ""}
              </h3>
              {items && items.length > 0 ? (
                <Button
                  type="button"
                  size="xs"
                  variant="outline"
                  onClick={() => setCreateOpen((v) => !v)}
                  aria-expanded={createOpen}
                  aria-controls="share-create-form"
                >
                  <HugeiconsIcon icon={Add01Icon} strokeWidth={2} />
                  {createOpen ? "Hide" : "New link"}
                </Button>
              ) : null}
            </header>

            {sharesQuery.isPending ? (
              <ul className="flex flex-col gap-2">
                <Skeleton className="h-[5.5rem] w-full rounded-lg" />
                <Skeleton className="h-[5.5rem] w-full rounded-lg" />
              </ul>
            ) : !items || items.length === 0 ? (
              <p className="rounded-md bg-muted/30 px-3 py-3 text-center text-xs text-muted-foreground ring-1 ring-border/40">
                No active links yet — create one below.
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {items.map((sh) => (
                  <ShareLinkRow
                    key={sh.token}
                    share={sh}
                    lockedToRead={lockedToRead}
                    onEdit={async (patch) => {
                      await updateShare.mutateAsync({ token: sh.token, body: patch });
                    }}
                    onRotate={async () => {
                      const result = await rotateShare.mutateAsync(sh.token);
                      return { newToken: result.new.token };
                    }}
                    onRevoke={async () => {
                      await revokeShare.mutateAsync(sh.token);
                    }}
                  />
                ))}
              </ul>
            )}
          </section>

          {/* ── Create form ────────────────────────────────────────── */}
          {createOpen ? (
            <section
              id="share-create-form"
              className="flex flex-col gap-3 rounded-xl bg-card/60 p-4 ring-1 ring-border/60"
            >
              <h3 className="font-heading text-sm uppercase tracking-wide text-muted-foreground">
                Create new link
              </h3>
              <ShareLinkCreateForm
                pending={createShare.isPending}
                resetSignal={resetSignal}
                lockedToRead={lockedToRead}
                onCreate={async (body) => {
                  try {
                    const sh = await createShare.mutateAsync(body);
                    const copied = await copyToClipboard(shareUrl(sh.token));
                    toast.success(copied ? "Link created and copied." : "Link created.");
                    return sh;
                  } catch (e) {
                    toast.error(errorMessage(e, "could not create share"));
                    throw e;
                  }
                }}
              />
            </section>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
