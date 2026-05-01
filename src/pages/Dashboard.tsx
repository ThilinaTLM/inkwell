import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Copy01Icon,
  Delete02Icon,
  Edit02Icon,
  Image01Icon,
  Link01Icon,
  MoreHorizontalIcon,
  PlusSignIcon,
  Search01Icon,
  Share08Icon,
} from "@hugeicons/core-free-icons";
import { toast } from "sonner";

import { ApiError, SceneMeta, User, scenes, shares } from "@/api";
import { Topbar } from "@/components/Topbar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface DashboardProps {
  user: User;
  onLogout: () => void;
}

export default function Dashboard({ user, onLogout }: DashboardProps) {
  const [items, setItems] = useState<SceneMeta[] | null>(null);
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);
  const [renameTarget, setRenameTarget] = useState<SceneMeta | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SceneMeta | null>(null);
  const [shareTarget, setShareTarget] = useState<SceneMeta | null>(null);
  const navigate = useNavigate();

  async function refresh() {
    try {
      setItems(await scenes.list());
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "failed to load scenes");
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function createNew() {
    setCreating(true);
    try {
      const m = await scenes.create();
      navigate(`/s/${m.id}`);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "failed to create scene");
    } finally {
      setCreating(false);
    }
  }

  const filtered = useMemo(() => {
    if (!items) return null;
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter((s) => s.name.toLowerCase().includes(q));
  }, [items, search]);

  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground">
      <Topbar
        user={user}
        onLogout={onLogout}
        center={
          <div className="relative w-full max-w-sm">
            <HugeiconsIcon
              icon={Search01Icon}
              strokeWidth={2}
              className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              type="search"
              placeholder="Search scenes…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-7"
            />
          </div>
        }
        actions={
          <Button onClick={createNew} disabled={creating}>
            <HugeiconsIcon icon={PlusSignIcon} strokeWidth={2} />
            New scene
          </Button>
        }
      />

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
        {filtered === null ? (
          <SceneGridSkeleton />
        ) : filtered.length === 0 ? (
          <EmptyState
            search={search}
            hasAny={!!items && items.length > 0}
            onCreate={createNew}
            creating={creating}
          />
        ) : (
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filtered.map((s) => (
              <SceneCard
                key={s.id}
                scene={s}
                onRename={() => setRenameTarget(s)}
                onDelete={() => setDeleteTarget(s)}
                onShare={() => setShareTarget(s)}
              />
            ))}
          </ul>
        )}
      </main>

      <RenameDialog
        scene={renameTarget}
        onOpenChange={(open) => !open && setRenameTarget(null)}
        onRenamed={(updated) => {
          setItems((prev) =>
            prev ? prev.map((x) => (x.id === updated.id ? updated : x)) : prev
          );
          setRenameTarget(null);
        }}
      />

      <DeleteDialog
        scene={deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        onDeleted={(id) => {
          setItems((prev) => (prev ? prev.filter((x) => x.id !== id) : prev));
          setDeleteTarget(null);
        }}
      />

      <ShareDialog
        scene={shareTarget}
        onOpenChange={(open) => !open && setShareTarget(null)}
      />
    </div>
  );
}

// ─── Scene card ─────────────────────────────────────────────────────────

interface SceneCardProps {
  scene: SceneMeta;
  onRename: () => void;
  onDelete: () => void;
  onShare: () => void;
}

function SceneCard({ scene, onRename, onDelete, onShare }: SceneCardProps) {
  return (
    <li className="group/scene relative overflow-hidden rounded-lg bg-card text-card-foreground ring-1 ring-foreground/10 transition-all hover:ring-foreground/20">
      <Link
        to={`/s/${scene.id}`}
        aria-label={`Open ${scene.name}`}
        className="block aspect-[4/3] w-full overflow-hidden bg-muted/40 outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
      >
        {scene.hasThumb ? (
          <img
            src={`/api/scenes/${scene.id}/thumb?v=${scene.version}`}
            alt=""
            loading="lazy"
            className="h-full w-full object-contain transition-transform duration-300 group-hover/scene:scale-[1.02]"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-muted-foreground/60">
            <HugeiconsIcon
              icon={Image01Icon}
              strokeWidth={1.5}
              className="size-10"
            />
          </div>
        )}
      </Link>
      <div className="flex items-center gap-2 px-3 py-2">
        <div className="min-w-0 flex-1">
          <Link
            to={`/s/${scene.id}`}
            className="block truncate text-xs/relaxed font-medium text-foreground hover:underline"
            title={scene.name}
          >
            {scene.name}
          </Link>
          <div className="text-[0.6875rem] text-muted-foreground">
            {relTime(scene.updatedAt)}
          </div>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Actions for ${scene.name}`}
              />
            }
          >
            <HugeiconsIcon icon={MoreHorizontalIcon} strokeWidth={2} />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" sideOffset={4}>
            <DropdownMenuItem onClick={onShare}>
              <HugeiconsIcon icon={Share08Icon} strokeWidth={2} />
              Share…
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onRename}>
              <HugeiconsIcon icon={Edit02Icon} strokeWidth={2} />
              Rename
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onClick={onDelete}>
              <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </li>
  );
}

// ─── Empty + skeleton ───────────────────────────────────────────────────

function EmptyState({
  search,
  hasAny,
  onCreate,
  creating,
}: {
  search: string;
  hasAny: boolean;
  onCreate: () => void;
  creating: boolean;
}) {
  if (hasAny && search) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-2 rounded-lg border border-dashed border-border/60 px-6 py-16 text-center">
        <HugeiconsIcon
          icon={Search01Icon}
          strokeWidth={1.5}
          className="size-7 text-muted-foreground"
        />
        <div className="text-sm font-medium">No matches</div>
        <p className="text-xs/relaxed text-muted-foreground">
          No scenes match “{search}”.
        </p>
      </div>
    );
  }
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-3 rounded-lg border border-dashed border-border/60 px-6 py-16 text-center">
      <HugeiconsIcon
        icon={Image01Icon}
        strokeWidth={1.5}
        className="size-8 text-muted-foreground"
      />
      <div className="space-y-1">
        <div className="text-sm font-medium">No scenes yet</div>
        <p className="text-xs/relaxed text-muted-foreground">
          Start sketching — your first scene is one click away.
        </p>
      </div>
      <Button onClick={onCreate} disabled={creating} size="lg" className="mt-2">
        <HugeiconsIcon icon={PlusSignIcon} strokeWidth={2} />
        Create your first scene
      </Button>
    </div>
  );
}

function SceneGridSkeleton() {
  return (
    <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {Array.from({ length: 8 }).map((_, i) => (
        <li
          key={i}
          className="overflow-hidden rounded-lg bg-card ring-1 ring-foreground/10"
        >
          <Skeleton className="aspect-[4/3] w-full rounded-none" />
          <div className="flex items-center gap-2 px-3 py-2">
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-3 w-3/5" />
              <Skeleton className="h-2.5 w-1/4" />
            </div>
            <Skeleton className="size-6 rounded-md" />
          </div>
        </li>
      ))}
    </ul>
  );
}

// ─── Rename dialog ──────────────────────────────────────────────────────

interface RenameDialogProps {
  scene: SceneMeta | null;
  onOpenChange: (open: boolean) => void;
  onRenamed: (m: SceneMeta) => void;
}

function RenameDialog({ scene, onOpenChange, onRenamed }: RenameDialogProps) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (scene) setName(scene.name);
  }, [scene]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!scene) return;
    const next = name.trim();
    if (!next || next === scene.name) {
      onOpenChange(false);
      return;
    }
    setBusy(true);
    try {
      const updated = await scenes.rename(scene.id, next);
      toast.success(`Renamed to “${updated.name}”.`);
      onRenamed(updated);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "rename failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={!!scene} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Rename scene</DialogTitle>
          <DialogDescription>
            Give your scene a more memorable name.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="rename">Name</Label>
            <Input
              id="rename"
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
              Rename
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Delete confirmation ────────────────────────────────────────────────

interface DeleteDialogProps {
  scene: SceneMeta | null;
  onOpenChange: (open: boolean) => void;
  onDeleted: (id: string) => void;
}

function DeleteDialog({ scene, onOpenChange, onDeleted }: DeleteDialogProps) {
  const [busy, setBusy] = useState(false);

  async function confirm() {
    if (!scene) return;
    setBusy(true);
    try {
      await scenes.delete(scene.id);
      toast.success(`Deleted “${scene.name}”.`);
      onDeleted(scene.id);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "delete failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AlertDialog open={!!scene} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete scene?</AlertDialogTitle>
          <AlertDialogDescription>
            “{scene?.name}” will be permanently removed. This cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={(e) => {
              // Prevent the AlertDialog from closing while the request is in-flight.
              e.preventDefault();
              void confirm();
            }}
            disabled={busy}
          >
            {busy ? "Deleting…" : "Delete"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// ─── Share dialog ───────────────────────────────────────────────────────

interface ShareDialogProps {
  scene: SceneMeta | null;
  onOpenChange: (open: boolean) => void;
}

function ShareDialog({ scene, onOpenChange }: ShareDialogProps) {
  const [perm, setPerm] = useState<"read" | "write">("read");
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!scene) {
      setUrl(null);
      setPerm("read");
    }
  }, [scene]);

  async function generate() {
    if (!scene) return;
    setBusy(true);
    try {
      const t = await shares.create(scene.id, perm);
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
      toast.success("Copied to clipboard.");
    } catch {
      toast.error("Could not copy.");
    }
  }

  return (
    <Dialog open={!!scene} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Share “{scene?.name}”</DialogTitle>
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
                subtitle="Recipients can view but not edit."
              />
              <PermOption
                active={perm === "write"}
                onClick={() => setPerm("write")}
                title="Can edit"
                subtitle="Recipients can edit the scene."
              />
            </div>
          </div>

          {url ? (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="share-url">Link</Label>
              <div className="flex gap-1.5">
                <Input
                  id="share-url"
                  readOnly
                  value={url}
                  onFocus={(e) => e.currentTarget.select()}
                  className="font-mono text-[0.6875rem]"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={copy}
                  aria-label="Copy link"
                >
                  <HugeiconsIcon icon={Copy01Icon} strokeWidth={2} />
                </Button>
              </div>
            </div>
          ) : null}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Close
          </Button>
          <Button onClick={generate} disabled={busy}>
            <HugeiconsIcon icon={Link01Icon} strokeWidth={2} />
            {busy ? "Creating…" : url ? "Create another" : "Create link"}
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

// ─── Helpers ────────────────────────────────────────────────────────────

function relTime(ms: number): string {
  const diff = Date.now() - ms;
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(ms).toLocaleDateString();
}
