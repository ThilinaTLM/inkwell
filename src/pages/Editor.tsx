import { FormEvent, useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Alert02Icon,
  ArrowLeft01Icon,
  Copy01Icon,
  Edit02Icon,
  Link01Icon,
  Loading03Icon,
  Share08Icon,
} from "@hugeicons/core-free-icons";
import { toast } from "sonner";

import { ApiError, LoadedScene, SceneBlob, scenes, shares } from "@/api";
import SceneEditor from "@/components/SceneEditor";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export default function Editor() {
  const { id = "" } = useParams<{ id: string }>();
  const [loaded, setLoaded] = useState<LoadedScene | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [renameOpen, setRenameOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);

  const reload = useCallback(async () => {
    const ls = await scenes.load(id);
    setLoaded(ls);
    return ls;
  }, [id]);

  useEffect(() => {
    setLoaded(null);
    setErr(null);
    reload().catch((e) =>
      setErr(e instanceof ApiError ? e.message : "load failed")
    );
  }, [reload]);

  const save = useCallback(
    async (version: number, blob: SceneBlob) => {
      const m = await scenes.save(id, version, blob);
      setLoaded((prev) =>
        prev
          ? {
              ...prev,
              meta: {
                ...prev.meta,
                name: m.name,
                version: m.version,
                updatedAt: m.updatedAt,
              },
            }
          : prev
      );
      return { version: m.version };
    },
    [id]
  );

  const saveThumb = useCallback((svg: string) => scenes.putThumb(id, svg), [id]);

  if (err) {
    return <EditorErrorState message={err} />;
  }

  if (!loaded) {
    return <EditorLoadingState label="Loading scene…" />;
  }

  return (
    <div className="flex h-dvh flex-col bg-background text-foreground">
      <EditorHeader
        backHref="/"
        backLabel="Back to scenes"
        title={loaded.meta.name}
        titleAction={
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => setRenameOpen(true)}
                  aria-label="Rename scene"
                />
              }
            >
              <HugeiconsIcon icon={Edit02Icon} strokeWidth={2} />
            </TooltipTrigger>
            <TooltipContent>Rename</TooltipContent>
          </Tooltip>
        }
        actions={
          <Dialog open={shareOpen} onOpenChange={setShareOpen}>
            <DialogTrigger
              render={
                <Button variant="outline" size="sm">
                  <HugeiconsIcon icon={Share08Icon} strokeWidth={2} />
                  Share
                </Button>
              }
            />
            <ShareDialogContent sceneId={id} />
          </Dialog>
        }
      />

      <div className="flex-1 min-h-0">
        <SceneEditor
          loaded={loaded}
          save={save}
          saveThumb={saveThumb}
          reload={reload}
          onReload={(ls) => setLoaded(ls)}
        />
      </div>

      <RenameDialog
        open={renameOpen}
        onOpenChange={setRenameOpen}
        currentName={loaded.meta.name}
        onRename={async (next) => {
          try {
            const m = await scenes.rename(id, next);
            setLoaded((prev) =>
              prev ? { ...prev, meta: { ...prev.meta, name: m.name } } : prev
            );
            toast.success(`Renamed to “${m.name}”.`);
            setRenameOpen(false);
          } catch (e) {
            toast.error(e instanceof ApiError ? e.message : "rename failed");
          }
        }}
      />
    </div>
  );
}

// ─── Editor header (also used by SharedEditor) ─────────────────────────

interface EditorHeaderProps {
  backHref?: string;
  backLabel?: string;
  title: string;
  titleAction?: React.ReactNode;
  badge?: React.ReactNode;
  actions?: React.ReactNode;
}

export function EditorHeader({
  backHref,
  backLabel = "Back",
  title,
  titleAction,
  badge,
  actions,
}: EditorHeaderProps) {
  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border/60 bg-background/80 px-3 backdrop-blur supports-backdrop-filter:bg-background/60">
      {backHref && (
        <Tooltip>
          <TooltipTrigger
            render={
              <Link
                to={backHref}
                aria-label={backLabel}
                className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              />
            }
          >
            <HugeiconsIcon icon={ArrowLeft01Icon} strokeWidth={2} className="size-3.5" />
          </TooltipTrigger>
          <TooltipContent>{backLabel}</TooltipContent>
        </Tooltip>
      )}

      <div className="flex min-w-0 flex-1 items-center gap-1">
        <span
          className="truncate font-heading text-sm font-medium"
          title={title}
        >
          {title}
        </span>
        {titleAction}
        {badge}
      </div>

      {actions}
    </header>
  );
}

// ─── Rename dialog ──────────────────────────────────────────────────────

interface RenameDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  currentName: string;
  onRename: (next: string) => Promise<void>;
}

function RenameDialog({
  open,
  onOpenChange,
  currentName,
  onRename,
}: RenameDialogProps) {
  const [name, setName] = useState(currentName);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) setName(currentName);
  }, [open, currentName]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const next = name.trim();
    if (!next || next === currentName) {
      onOpenChange(false);
      return;
    }
    setBusy(true);
    try {
      await onRename(next);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Rename scene</DialogTitle>
          <DialogDescription>This is what you'll see on the dashboard.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="rename-input">Name</Label>
            <Input
              id="rename-input"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
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
            <Button type="submit" disabled={busy || !name.trim()}>
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Share dialog content (per-Editor sceneId) ─────────────────────────

function ShareDialogContent({ sceneId }: { sceneId: string }) {
  const [perm, setPerm] = useState<"read" | "write">("read");
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function generate() {
    setBusy(true);
    try {
      const t = await shares.create(sceneId, perm);
      const next = `${location.origin}/share/${t.token}`;
      setUrl(next);
      try {
        await navigator.clipboard.writeText(next);
        toast.success("Share link created and copied.");
      } catch {
        toast.success("Share link created.");
      }
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "share failed");
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Copied.");
    } catch {
      toast.error("Could not copy.");
    }
  }

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Share this scene</DialogTitle>
        <DialogDescription>
          Anyone with the link can {perm === "read" ? "view" : "edit"} this
          scene.
        </DialogDescription>
      </DialogHeader>
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <Label>Permission</Label>
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
              subtitle="Full editing access."
            />
          </div>
        </div>

        {url && (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="share-link">Link</Label>
            <div className="flex gap-1.5">
              <Input
                id="share-link"
                readOnly
                value={url}
                onFocus={(e) => e.currentTarget.select()}
                className="font-mono text-[0.6875rem]"
              />
              <Button
                variant="outline"
                size="icon"
                onClick={copy}
                aria-label="Copy"
              >
                <HugeiconsIcon icon={Copy01Icon} strokeWidth={2} />
              </Button>
            </div>
          </div>
        )}
      </div>
      <DialogFooter>
        <Button onClick={generate} disabled={busy}>
          {busy ? (
            <HugeiconsIcon
              icon={Loading03Icon}
              strokeWidth={2}
              className="animate-spin"
            />
          ) : (
            <HugeiconsIcon icon={Link01Icon} strokeWidth={2} />
          )}
          {url ? "Create another" : "Create link"}
        </Button>
      </DialogFooter>
    </DialogContent>
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
      className="rounded-md border border-border bg-input/20 px-2.5 py-2 text-left text-xs/relaxed transition-colors hover:bg-input/40 data-[active=true]:border-ring data-[active=true]:bg-accent data-[active=true]:text-accent-foreground"
    >
      <div className="font-medium">{title}</div>
      <div className="text-[0.6875rem] text-muted-foreground">{subtitle}</div>
    </button>
  );
}

// ─── Loading + error chrome ─────────────────────────────────────────────

export function EditorLoadingState({ label }: { label: string }) {
  return (
    <div className="grid min-h-dvh place-items-center bg-background text-muted-foreground">
      <div className="flex items-center gap-2 text-xs">
        <HugeiconsIcon
          icon={Loading03Icon}
          strokeWidth={2}
          className="size-4 animate-spin"
        />
        {label}
      </div>
    </div>
  );
}

export function EditorErrorState({ message }: { message: string }) {
  return (
    <div className="grid min-h-dvh place-items-center bg-background px-4">
      <div className="flex max-w-sm flex-col items-center gap-3 rounded-lg border border-border bg-card p-6 text-center text-card-foreground">
        <HugeiconsIcon
          icon={Alert02Icon}
          strokeWidth={2}
          className="size-6 text-destructive"
        />
        <div className="space-y-1">
          <div className="text-sm font-medium">Couldn't load this scene</div>
          <p className="text-xs/relaxed text-muted-foreground">{message}</p>
        </div>
        <Button variant="outline" size="sm" render={<Link to="/" />}>
          <HugeiconsIcon icon={ArrowLeft01Icon} strokeWidth={2} />
          Back to dashboard
        </Button>
      </div>
    </div>
  );
}
