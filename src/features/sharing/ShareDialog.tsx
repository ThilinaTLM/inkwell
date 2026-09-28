// Compact share dialog (wireframe screen 16): active links on top, a
// create-new form with sensible defaults below, "Create & copy link"
// (⌘↵) and "Manage all links →" to the Shared links page.
//
// PUBLIC CONTRACT (unchanged; mounted by DialogHost's "share" entry)
//   <ShareDialog open onOpenChange targetType targetId targetName targetKind? />

import {
  Copy01Icon,
  Delete02Icon,
  Edit02Icon,
  Link04Icon,
  LinkSquare02Icon,
  MoreHorizontalIcon,
  RefreshIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { type KeyboardEvent, useEffect, useId, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Kbd } from "@/components/shell/Kbd";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { useCreateShare, useRevokeShare, useRotateShare, useShareList } from "@/data/shares";
import { confirmDialog } from "@/features/dialogs/dialogStore";
import { ItemIcon } from "@/features/library/ItemTable";
import { PermBadge } from "@/features/library/ListTable";
import type { FileKind, Share, SharePermission, ShareTargetType } from "@/lib/api/client";
import { copyToClipboard } from "@/lib/clipboard";
import { isMacPlatform } from "@/lib/commands/keymap";
import { errorMessage } from "@/lib/errors";
import { shareUrl } from "@/lib/url";
import { cn } from "@/lib/utils";
import { AllowDownloadField } from "./fields/AllowDownloadField";
import { ExpiryChips, type ExpiryChoice } from "./fields/ExpiryChips";
import { LabelField } from "./fields/LabelField";
import { PermissionSegment } from "./fields/PermissionSegment";
import { presetToExpiresAt, shareStatus, shortExpiry } from "./shareStatus";

interface ShareDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  targetType: ShareTargetType;
  targetId: string;
  targetName: string;
  /** Static-site files lock the permission to view-only. */
  targetKind?: FileKind;
}

export async function copyShareLink(token: string, message = "Link copied") {
  const ok = await copyToClipboard(shareUrl(token));
  if (ok) toast.success(message);
  else toast.error("Couldn't access the clipboard", { description: shareUrl(token) });
}

export function ShareDialog({
  open,
  onOpenChange,
  targetType,
  targetId,
  targetName,
  targetKind,
}: ShareDialogProps) {
  const navigate = useNavigate();
  const lockedToRead = targetType === "file" && targetKind === "static-site";
  const list = useShareList(targetType, targetId, open);
  const create = useCreateShare(targetType, targetId);
  const now = Date.now();
  const active = (list.data ?? []).filter((s) => shareStatus(s, now) !== "expired");

  const [label, setLabel] = useState("");
  const [permission, setPermission] = useState<SharePermission>("read");
  const [expiry, setExpiry] = useState<ExpiryChoice>("7d");
  const [customAt, setCustomAt] = useState<number | null>(null);
  const [allowDownload, setAllowDownload] = useState(true);
  const labelId = useId();

  useEffect(() => {
    if (!open) return;
    setLabel("");
    setPermission("read");
    setExpiry("7d");
    setCustomAt(null);
    setAllowDownload(true);
  }, [open]);

  async function submit() {
    if (create.isPending) return;
    if (expiry === "custom" && (!customAt || customAt <= Date.now())) {
      toast.error("Pick a custom expiry in the future.");
      return;
    }
    const perm = lockedToRead ? "read" : permission;
    try {
      const s = await create.mutateAsync({
        permission: perm,
        allowDownload: perm === "write" ? true : allowDownload,
        expiresAt: expiry === "custom" ? customAt : presetToExpiresAt(expiry, Date.now()),
        label: label.trim() || null,
      });
      await copyShareLink(s.token, "Link created and copied");
      setLabel("");
    } catch (e) {
      toast.error(errorMessage(e, "could not create share"));
    }
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === "Enter" && (isMacPlatform ? e.metaKey : e.ctrlKey)) {
      e.preventDefault();
      void submit();
    }
  }

  const manageAll = () => {
    onOpenChange(false);
    navigate("/shares");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-0 p-[18px] sm:max-w-[520px]" onKeyDown={onKeyDown}>
        <div className="flex items-center gap-2 pr-8">
          <ItemIcon kind={targetType === "file" ? (targetKind ?? "excalidraw") : undefined} />
          <DialogTitle className="truncate text-[15px] font-semibold">
            Share “{targetName}”
          </DialogTitle>
        </div>

        <SectionLabel>Active links · {active.length}</SectionLabel>
        {list.isPending ? (
          <div className="flex flex-col gap-1.5">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        ) : active.length === 0 ? (
          <p className="py-1 text-xs text-muted-foreground">No active links yet.</p>
        ) : (
          <div className="flex max-h-[180px] flex-col overflow-y-auto">
            {active.map((s) => (
              <ActiveLinkRow
                key={s.token}
                share={s}
                now={now}
                targetType={targetType}
                targetId={targetId}
                onEdit={() => {
                  onOpenChange(false);
                  navigate(`/shares?token=${encodeURIComponent(s.token)}`);
                }}
              />
            ))}
          </div>
        )}

        <SectionLabel>New link</SectionLabel>
        <div className="grid grid-cols-[110px_1fr] items-center gap-x-3 gap-y-2.5">
          <label htmlFor={labelId} className="text-xs text-muted-foreground">
            Label
          </label>
          <LabelField id={labelId} value={label} onChange={setLabel} autoFocus />
          <span className="text-xs text-muted-foreground">Access</span>
          <div>
            <PermissionSegment
              value={lockedToRead ? "read" : permission}
              onChange={setPermission}
              lockedToRead={lockedToRead}
            />
          </div>
          <span className="self-start pt-1 text-xs text-muted-foreground">Expires</span>
          <ExpiryChips
            value={expiry}
            onChange={(id) => {
              setExpiry(id);
              if (id === "custom" && !customAt) setCustomAt(Date.now() + 3 * 86_400_000);
            }}
            allowCustom
            customAt={customAt}
            onCustomAt={setCustomAt}
          />
          <span className="text-xs text-muted-foreground">Downloads</span>
          <div>
            <AllowDownloadField
              permission={lockedToRead ? "read" : permission}
              value={allowDownload}
              onChange={setAllowDownload}
            />
          </div>
        </div>

        <div className="mt-4 flex items-center gap-2">
          <button
            type="button"
            onClick={manageAll}
            className="text-xs text-primary underline-offset-4 hover:underline"
          >
            Manage all links →
          </button>
          <span className="flex-1" />
          <Button onClick={() => void submit()} disabled={create.isPending}>
            <HugeiconsIcon icon={Link04Icon} strokeWidth={2} />
            {create.isPending ? "Creating…" : "Create & copy link"}
            <span className="ml-1 inline-flex gap-0.5 opacity-80">
              <Kbd className="border-primary-foreground/40 bg-transparent text-primary-foreground">
                {isMacPlatform ? "⌘" : "Ctrl"}
              </Kbd>
              <Kbd className="border-primary-foreground/40 bg-transparent text-primary-foreground">
                ↵
              </Kbd>
            </span>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-3.5 mb-2 flex items-center gap-2 text-[11px] tracking-[0.08em] text-muted-foreground uppercase">
      {children}
      <span className="h-px flex-1 bg-border" />
    </div>
  );
}

function ActiveLinkRow({
  share,
  now,
  targetType,
  targetId,
  onEdit,
}: {
  share: Share;
  now: number;
  targetType: ShareTargetType;
  targetId: string;
  onEdit: () => void;
}) {
  const rotate = useRotateShare(targetType, targetId);
  const revoke = useRevokeShare(targetType, targetId);
  const expiring = shareStatus(share, now) === "expiring";

  return (
    <div className="flex h-8 items-center gap-2 rounded-md px-1.5 text-[13px] hover:bg-muted/60">
      <HugeiconsIcon
        icon={Link04Icon}
        strokeWidth={1.8}
        className="size-3.5 text-muted-foreground"
      />
      <span className="min-w-0 flex-1 truncate">
        {share.label || <span className="text-muted-foreground">Untitled link</span>}
      </span>
      <PermBadge permission={share.permission} />
      <span
        className={cn("w-10 text-right text-xs text-muted-foreground", expiring && "text-chart-3")}
        title={share.expiresAt ? new Date(share.expiresAt).toLocaleString() : "Never expires"}
      >
        {shortExpiry(share.expiresAt, now)}
      </span>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Copy link"
        title="Copy link"
        onClick={() => void copyShareLink(share.token)}
      >
        <HugeiconsIcon icon={Copy01Icon} strokeWidth={2} />
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={<Button variant="ghost" size="icon-sm" aria-label="More link actions" />}
        >
          <HugeiconsIcon icon={MoreHorizontalIcon} strokeWidth={2} />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-48">
          <DropdownMenuItem
            onClick={() => window.open(shareUrl(share.token), "_blank", "noopener")}
          >
            <HugeiconsIcon icon={LinkSquare02Icon} strokeWidth={2} />
            Open link
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onEdit}>
            <HugeiconsIcon icon={Edit02Icon} strokeWidth={2} />
            Edit in Shared links
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={async () => {
              const ok = await confirmDialog({
                title: "Replace this link with a new URL?",
                description: "The current URL stops working immediately. Settings are kept.",
                confirmLabel: "Rotate link",
              });
              if (!ok) return;
              try {
                const r = await rotate.mutateAsync(share.token);
                await copyShareLink(r.new.token, "New link copied");
              } catch (e) {
                toast.error(errorMessage(e, "could not rotate link"));
              }
            }}
          >
            <HugeiconsIcon icon={RefreshIcon} strokeWidth={2} />
            Rotate URL…
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            onClick={async () => {
              const ok = await confirmDialog({
                title: "Revoke this link?",
                description: "Anyone using it loses access immediately. This can't be undone.",
                confirmLabel: "Revoke",
              });
              if (!ok) return;
              try {
                await revoke.mutateAsync(share.token);
                toast.success("Link revoked");
              } catch (e) {
                toast.error(errorMessage(e, "could not revoke link"));
              }
            }}
          >
            <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} />
            Revoke…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
