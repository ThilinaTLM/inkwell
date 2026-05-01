// Unified share dialog. Works for both scene and folder targets.
//
// Lists existing active shares with revoke buttons, and lets the owner
// create a new share with permission, allow-download, optional expiry,
// and optional label. Copies the new URL to the clipboard.

import { useEffect, useMemo, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Copy01Icon,
  Delete02Icon,
  Download01Icon,
  EyeIcon,
  Link01Icon,
  PencilEdit02Icon,
} from "@hugeicons/core-free-icons";
import { toast } from "sonner";

import {
  ApiError,
  Share,
  SharePermission,
  ShareTargetType,
  folders,
  scenes,
} from "@/api";
import { Badge } from "@/components/ui/badge";
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
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface ShareDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  targetType: ShareTargetType;
  targetId: string;
  targetName: string;
}

const EXPIRY_OPTIONS: { label: string; ms: number | null }[] = [
  { label: "Never", ms: null },
  { label: "1 day", ms: 24 * 60 * 60 * 1000 },
  { label: "7 days", ms: 7 * 24 * 60 * 60 * 1000 },
  { label: "30 days", ms: 30 * 24 * 60 * 60 * 1000 },
];

export function ShareDialog({
  open,
  onOpenChange,
  targetType,
  targetId,
  targetName,
}: ShareDialogProps) {
  const [perm, setPerm] = useState<SharePermission>("read");
  const [allowDownload, setAllowDownload] = useState(true);
  const [expiryIdx, setExpiryIdx] = useState(0);
  const [label, setLabel] = useState("");
  const [items, setItems] = useState<Share[] | null>(null);
  const [creating, setCreating] = useState(false);

  const api = useMemo(
    () => (targetType === "folder" ? folderApi : sceneApi),
    [targetType]
  );

  async function refresh() {
    try {
      const tokens = await api.list(targetId);
      setItems(tokens);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "could not load shares");
    }
  }

  useEffect(() => {
    if (!open) return;
    setItems(null);
    setPerm("read");
    setAllowDownload(true);
    setExpiryIdx(0);
    setLabel("");
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, targetId, targetType]);

  async function create() {
    setCreating(true);
    try {
      const expiresAt =
        EXPIRY_OPTIONS[expiryIdx].ms === null
          ? null
          : Date.now() + EXPIRY_OPTIONS[expiryIdx].ms!;
      const sh = await api.create(targetId, {
        permission: perm,
        allowDownload: perm === "write" ? true : allowDownload,
        expiresAt,
        label: label.trim() || null,
      });
      const url = `${location.origin}/share/${sh.token}`;
      try {
        await navigator.clipboard.writeText(url);
        toast.success("Link created and copied.");
      } catch {
        toast.success("Link created.");
      }
      await refresh();
      setLabel("");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "could not create share");
    } finally {
      setCreating(false);
    }
  }

  async function revoke(token: string) {
    try {
      await api.revoke(targetId, token);
      setItems((prev) => (prev ? prev.filter((t) => t.token !== token) : prev));
      toast.success("Revoked.");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "could not revoke");
    }
  }

  async function copy(token: string) {
    const url = `${location.origin}/share/${token}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Copied.");
    } catch {
      toast.error("Could not copy.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            Share{" "}
            {targetType === "folder" ? (
              <span>folder “{targetName}”</span>
            ) : (
              <span>“{targetName}”</span>
            )}
          </DialogTitle>
          <DialogDescription>
            Anyone with the link can{" "}
            {perm === "write" ? "view and edit" : "view"}
            {targetType === "folder" ? " everything inside this folder." : " this scene."}
          </DialogDescription>
        </DialogHeader>

        {/* Existing shares */}
        <div className="flex flex-col gap-2">
          <Label className="text-xs">Active links</Label>
          {items === null ? (
            <div className="flex flex-col gap-1.5">
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-9 w-full" />
            </div>
          ) : items.length === 0 ? (
            <p className="text-[0.6875rem] text-muted-foreground">
              No active links yet.
            </p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {items.map((sh) => (
                <li
                  key={sh.token}
                  className="flex items-center gap-2 rounded-md border border-border bg-input/10 px-2 py-1.5"
                >
                  <Badge variant={sh.permission === "write" ? "secondary" : "outline"}>
                    <HugeiconsIcon
                      icon={sh.permission === "write" ? PencilEdit02Icon : EyeIcon}
                      strokeWidth={2}
                    />
                    {sh.permission === "write" ? "Edit" : "View"}
                  </Badge>
                  {sh.allowDownload ? (
                    <Badge variant="outline">
                      <HugeiconsIcon icon={Download01Icon} strokeWidth={2} />
                      Download
                    </Badge>
                  ) : null}
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[0.6875rem]/relaxed font-medium">
                      {sh.label || `${location.origin}/share/${sh.token}`}
                    </div>
                    <div className="text-[0.625rem] text-muted-foreground">
                      Created {fmt(sh.createdAt)}
                      {sh.expiresAt ? ` · expires ${fmt(sh.expiresAt)}` : null}
                      {sh.lastAccessedAt
                        ? ` · last opened ${fmt(sh.lastAccessedAt)}`
                        : null}
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => copy(sh.token)}
                    aria-label="Copy link"
                  >
                    <HugeiconsIcon icon={Copy01Icon} strokeWidth={2} />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => revoke(sh.token)}
                    aria-label="Revoke"
                  >
                    <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} className="text-destructive" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Create new */}
        <div className="flex flex-col gap-2 rounded-md border border-dashed border-border/60 p-3">
          <Label className="text-xs">Create new link</Label>
          <div className="grid grid-cols-2 gap-2">
            <PermOption
              active={perm === "read"}
              onClick={() => setPerm("read")}
              title="View only"
              subtitle="Read-only access."
            />
            <PermOption
              active={perm === "write"}
              onClick={() => setPerm("write")}
              title="Can edit"
              subtitle="Read-write access."
            />
          </div>
          <label
            className={cn(
              "flex items-center gap-2 text-xs",
              perm === "write" && "text-muted-foreground"
            )}
          >
            <input
              type="checkbox"
              className="size-3.5"
              checked={perm === "write" ? true : allowDownload}
              disabled={perm === "write"}
              onChange={(e) => setAllowDownload(e.target.checked)}
            />
            Allow download (.excalidraw)
          </label>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="share-expiry" className="text-[0.6875rem]">
              Expires
            </Label>
            <div className="grid grid-cols-4 gap-1">
              {EXPIRY_OPTIONS.map((opt, i) => (
                <button
                  key={opt.label}
                  type="button"
                  onClick={() => setExpiryIdx(i)}
                  data-active={expiryIdx === i}
                  className="rounded-md border border-border bg-input/20 px-1.5 py-1 text-[0.6875rem] transition-colors data-[active=true]:border-ring data-[active=true]:bg-accent data-[active=true]:text-accent-foreground hover:bg-input/40"
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="share-label" className="text-[0.6875rem]">
              Label (optional)
            </Label>
            <Input
              id="share-label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. Q4 review"
              maxLength={200}
            />
          </div>
          <Button onClick={create} disabled={creating}>
            <HugeiconsIcon icon={Link01Icon} strokeWidth={2} />
            {creating ? "Creating…" : "Create link"}
          </Button>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PermOption({
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
      className="rounded-md border border-border bg-input/20 px-2.5 py-2 text-left text-xs/relaxed transition-colors data-[active=true]:border-ring data-[active=true]:bg-accent data-[active=true]:text-accent-foreground hover:bg-input/40"
    >
      <div className="font-medium">{title}</div>
      <div className="text-[0.6875rem] text-muted-foreground">{subtitle}</div>
    </button>
  );
}

function fmt(ms: number): string {
  return new Date(ms).toLocaleString();
}

// ─── Adapters so the dialog stays generic ──────────────────────────────
const sceneApi = {
  list: (id: string) => scenes.listShares(id),
  create: (id: string, body: Parameters<typeof scenes.createShare>[1]) =>
    scenes.createShare(id, body),
  revoke: (id: string, token: string) => scenes.revokeShare(id, token),
};

const folderApi = {
  list: (id: string) => folders.listShares(id),
  create: (id: string, body: Parameters<typeof folders.createShare>[1]) =>
    folders.createShare(id, body),
  revoke: (id: string, token: string) => folders.revokeShare(id, token),
};
