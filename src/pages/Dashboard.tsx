// Dashboard — folder tree + tag filters + scene grid.
//
// State lives here and is mirrored to the URL (`?folder=…&recursive=1
// &tag=…&q=…`) so views are linkable and survive reloads. Folder/tag
// dropdowns dispatch into a small set of dialog states; mutations re-run
// the same loaders so the sidebar counts and grid stay in sync.

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  ArrowRight01Icon,
  Cancel01Icon,
  Delete02Icon,
  Download01Icon,
  Edit02Icon,
  FolderAddIcon,
  HashtagIcon,
  Image01Icon,
  MoreHorizontalIcon,
  PlusSignIcon,
  Search01Icon,
  Share08Icon,
} from "@hugeicons/core-free-icons";
import { toast } from "sonner";

import {
  ApiError,
  FolderMeta,
  SceneMeta,
  Tag,
  User,
  folders,
  scenes,
  tags as tagsApi,
} from "@/api";
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
import { Sidebar, type ScenesScope } from "@/components/dashboard/Sidebar";
import { folderPath } from "@/components/FolderTree";
import { MoveToFolderDialog } from "@/components/MoveToFolderDialog";
import { TagEditDialog } from "@/components/TagEditDialog";
import { ShareDialog } from "@/components/ShareDialog";
import { cn } from "@/lib/utils";

interface DashboardProps {
  user: User;
  onLogout: () => void;
}

export default function Dashboard({ user, onLogout }: DashboardProps) {
  const [folderList, setFolderList] = useState<FolderMeta[] | null>(null);
  const [tagList, setTagList] = useState<Tag[] | null>(null);
  const [items, setItems] = useState<SceneMeta[] | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);

  // ─── URL state ────────────────────────────────────────────────────
  const scope: ScenesScope = useMemo(() => {
    const f = searchParams.get("folder");
    if (!f) return { kind: "all" };
    const recursive = searchParams.get("recursive") === "1";
    return { kind: "folder", id: f, recursive };
  }, [searchParams]);
  const activeTags = useMemo(() => searchParams.getAll("tag"), [searchParams]);
  const search = searchParams.get("q") || "";
  const debouncedSearch = useDebouncedValue(search, 250);

  function patchParams(next: Record<string, string | string[] | null>) {
    const sp = new URLSearchParams(searchParams);
    for (const [k, v] of Object.entries(next)) {
      sp.delete(k);
      if (v === null) continue;
      if (Array.isArray(v)) v.forEach((x) => sp.append(k, x));
      else sp.set(k, v);
    }
    setSearchParams(sp, { replace: true });
  }

  function setScope(next: ScenesScope) {
    if (next.kind === "all") patchParams({ folder: null, recursive: null });
    else
      patchParams({
        folder: next.id,
        recursive: next.recursive ? "1" : null,
      });
  }

  function toggleTag(name: string) {
    const next = activeTags.includes(name)
      ? activeTags.filter((t) => t !== name)
      : [...activeTags, name];
    patchParams({ tag: next.length ? next : null });
  }

  function setSearch(value: string) {
    patchParams({ q: value || null });
  }

  // ─── Loaders ──────────────────────────────────────────────────────
  const refreshFolders = useCallback(async () => {
    try {
      setFolderList(await folders.list());
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "could not load folders");
    }
  }, []);

  const refreshTags = useCallback(async () => {
    try {
      setTagList(await tagsApi.list());
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "could not load tags");
    }
  }, []);

  const refreshScenes = useCallback(async () => {
    try {
      setItems(
        await scenes.list({
          folderId: scope.kind === "folder" ? scope.id : undefined,
          recursive: scope.kind === "folder" ? scope.recursive : undefined,
          tags: activeTags.length ? activeTags : undefined,
          q: debouncedSearch || undefined,
        })
      );
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "could not load scenes");
    }
  }, [scope, activeTags, debouncedSearch]);

  useEffect(() => {
    void refreshFolders();
    void refreshTags();
  }, [refreshFolders, refreshTags]);

  useEffect(() => {
    setItems(null);
    void refreshScenes();
  }, [refreshScenes]);

  // ─── Dialog state ─────────────────────────────────────────────────
  const [renameTarget, setRenameTarget] = useState<SceneMeta | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SceneMeta | null>(null);
  const [moveTarget, setMoveTarget] = useState<SceneMeta | null>(null);
  const [tagSceneTarget, setTagSceneTarget] = useState<SceneMeta | null>(null);
  const [shareTarget, setShareTarget] = useState<
    | { kind: "scene"; scene: SceneMeta }
    | { kind: "folder"; folder: FolderMeta }
    | null
  >(null);
  const [folderRenameTarget, setFolderRenameTarget] = useState<FolderMeta | null>(null);
  const [folderMoveTarget, setFolderMoveTarget] = useState<FolderMeta | null>(null);
  const [folderTagsTarget, setFolderTagsTarget] = useState<FolderMeta | null>(null);
  const [folderDeleteTarget, setFolderDeleteTarget] = useState<FolderMeta | null>(null);
  const [folderCreate, setFolderCreate] = useState<{ parentId: string | null } | null>(null);

  // ─── Actions ──────────────────────────────────────────────────────
  async function createNew() {
    setCreating(true);
    try {
      const folderId = scope.kind === "folder" ? scope.id : undefined;
      const m = await scenes.create({ folderId });
      navigate(`/s/${m.id}`);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "failed to create scene");
    } finally {
      setCreating(false);
    }
  }

  const tagSuggestions = useMemo(() => (tagList || []).map((t) => t.name), [tagList]);
  const currentFolder = useMemo(() => {
    if (scope.kind !== "folder" || !folderList) return null;
    return folderList.find((f) => f.id === scope.id) ?? null;
  }, [scope, folderList]);
  const breadcrumb = useMemo(() => {
    if (!folderList || scope.kind !== "folder") return [];
    return folderPath(folderList, scope.id);
  }, [folderList, scope]);

  // Selected target name for share dialog.
  const shareName =
    shareTarget?.kind === "scene"
      ? shareTarget.scene.name
      : shareTarget?.kind === "folder"
        ? shareTarget.folder.name
        : "";

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

      <div className="flex flex-1">
        <Sidebar
          folders={folderList}
          tags={tagList}
          scope={scope}
          activeTags={activeTags}
          onScopeChange={setScope}
          onTagToggle={toggleTag}
          onCreateRootFolder={() => setFolderCreate({ parentId: null })}
          onCreateSubfolder={(f) => setFolderCreate({ parentId: f.id })}
          onRenameFolder={(f) => setFolderRenameTarget(f)}
          onMoveFolder={(f) => setFolderMoveTarget(f)}
          onEditFolderTags={(f) => setFolderTagsTarget(f)}
          onShareFolder={(f) => setShareTarget({ kind: "folder", folder: f })}
          onDeleteFolder={(f) => setFolderDeleteTarget(f)}
        />

        <main className="flex-1 px-4 py-4">
          <Breadcrumb breadcrumb={breadcrumb} onJump={(id) => setScope({ kind: "folder", id, recursive: scope.kind === "folder" ? scope.recursive : false })} onAll={() => setScope({ kind: "all" })} scope={scope} />
          <ActiveFilters
            activeTags={activeTags}
            search={search}
            onRemoveTag={toggleTag}
            onClearSearch={() => setSearch("")}
          />
          <SceneGridArea
            items={items}
            search={search}
            currentFolder={currentFolder}
            onCreate={createNew}
            creating={creating}
            folders={folderList}
            onOpenScene={(id) => navigate(`/s/${id}`)}
            onRename={setRenameTarget}
            onDelete={setDeleteTarget}
            onMove={setMoveTarget}
            onEditTags={setTagSceneTarget}
            onShare={(s) => setShareTarget({ kind: "scene", scene: s })}
          />
        </main>
      </div>

      <RenameDialog
        scene={renameTarget}
        onOpenChange={(open) => !open && setRenameTarget(null)}
        onRenamed={(updated) => {
          setItems((prev) => (prev ? prev.map((x) => (x.id === updated.id ? updated : x)) : prev));
          setRenameTarget(null);
        }}
      />

      <DeleteDialog
        scene={deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        onDeleted={(id) => {
          setItems((prev) => (prev ? prev.filter((x) => x.id !== id) : prev));
          setDeleteTarget(null);
          void refreshFolders();
        }}
      />

      {/* Move scene */}
      {folderList && moveTarget ? (
        <MoveToFolderDialog
          open={!!moveTarget}
          onOpenChange={(o) => !o && setMoveTarget(null)}
          folders={folderList}
          initialId={moveTarget.folderId}
          title={`Move “${moveTarget.name}”`}
          description="Pick a destination folder."
          onSubmit={async (folderId) => {
            try {
              const updated = await scenes.move(moveTarget.id, folderId);
              setItems((prev) => (prev ? prev.map((x) => (x.id === updated.id ? updated : x)) : prev));
              toast.success("Moved.");
              await refreshFolders();
            } catch (e) {
              toast.error(e instanceof ApiError ? e.message : "could not move");
            }
          }}
        />
      ) : null}

      {/* Edit scene tags */}
      {tagSceneTarget ? (
        <TagEditDialog
          open={!!tagSceneTarget}
          onOpenChange={(o) => !o && setTagSceneTarget(null)}
          initialTags={tagSceneTarget.tags}
          suggestions={tagSuggestions}
          title={`Tags for “${tagSceneTarget.name}”`}
          onSave={async (next) => {
            const result = await scenes.setTags(tagSceneTarget.id, next);
            return result.tags;
          }}
          onSaved={async (next) => {
            setItems((prev) =>
              prev
                ? prev.map((x) => (x.id === tagSceneTarget.id ? { ...x, tags: next } : x))
                : prev
            );
            await refreshTags();
          }}
        />
      ) : null}

      {/* Share */}
      {shareTarget ? (
        <ShareDialog
          open={!!shareTarget}
          onOpenChange={(o) => !o && setShareTarget(null)}
          targetType={shareTarget.kind}
          targetId={
            shareTarget.kind === "scene"
              ? shareTarget.scene.id
              : shareTarget.folder.id
          }
          targetName={shareName}
        />
      ) : null}

      {/* Folder dialogs */}
      {folderCreate ? (
        <FolderCreateDialog
          parentId={folderCreate.parentId}
          onOpenChange={(o) => !o && setFolderCreate(null)}
          onCreated={async () => {
            setFolderCreate(null);
            await refreshFolders();
          }}
        />
      ) : null}
      {folderRenameTarget ? (
        <FolderRenameDialog
          folder={folderRenameTarget}
          onOpenChange={(o) => !o && setFolderRenameTarget(null)}
          onRenamed={async () => {
            setFolderRenameTarget(null);
            await refreshFolders();
          }}
        />
      ) : null}
      {folderList && folderMoveTarget ? (
        <FolderMoveDialog
          folder={folderMoveTarget}
          folders={folderList}
          onOpenChange={(o) => !o && setFolderMoveTarget(null)}
          onMoved={async () => {
            setFolderMoveTarget(null);
            await refreshFolders();
          }}
        />
      ) : null}
      {folderTagsTarget ? (
        <TagEditDialog
          open={!!folderTagsTarget}
          onOpenChange={(o) => !o && setFolderTagsTarget(null)}
          initialTags={folderTagsTarget.tags}
          suggestions={tagSuggestions}
          title={`Tags for “${folderTagsTarget.name}”`}
          onSave={async (next) => {
            const updated = await folders.update(folderTagsTarget.id, { tags: next });
            return updated.tags;
          }}
          onSaved={async () => {
            await refreshFolders();
            await refreshTags();
          }}
        />
      ) : null}
      {folderDeleteTarget ? (
        <FolderDeleteDialog
          folder={folderDeleteTarget}
          onOpenChange={(o) => !o && setFolderDeleteTarget(null)}
          onDeleted={async () => {
            setFolderDeleteTarget(null);
            await refreshFolders();
            await refreshScenes();
            // If we just deleted the active folder, fall back to All scenes.
            if (scope.kind === "folder" && scope.id === folderDeleteTarget.id) {
              setScope({ kind: "all" });
            }
          }}
        />
      ) : null}
    </div>
  );
}

// ─── Breadcrumb + filters ────────────────────────────────────────────────

function Breadcrumb({
  breadcrumb,
  scope,
  onJump,
  onAll,
}: {
  breadcrumb: FolderMeta[];
  scope: ScenesScope;
  onJump: (id: string) => void;
  onAll: () => void;
}) {
  return (
    <nav className="flex items-center gap-1 text-xs/relaxed text-muted-foreground">
      <button
        type="button"
        onClick={onAll}
        className={cn(
          "rounded px-1 py-0.5 hover:bg-muted/60",
          scope.kind === "all" && "text-foreground font-medium"
        )}
      >
        All scenes
      </button>
      {breadcrumb.map((f, i) => (
        <span key={f.id} className="flex items-center gap-1">
          <HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={2} className="size-3 opacity-50" />
          <button
            type="button"
            onClick={() => onJump(f.id)}
            className={cn(
              "rounded px-1 py-0.5 hover:bg-muted/60",
              i === breadcrumb.length - 1 && "text-foreground font-medium"
            )}
          >
            {f.name}
          </button>
        </span>
      ))}
    </nav>
  );
}

function ActiveFilters({
  activeTags,
  search,
  onRemoveTag,
  onClearSearch,
}: {
  activeTags: string[];
  search: string;
  onRemoveTag: (name: string) => void;
  onClearSearch: () => void;
}) {
  if (activeTags.length === 0 && !search) return null;
  return (
    <div className="mt-2 flex flex-wrap items-center gap-1">
      {activeTags.map((t) => (
        <button
          key={t}
          type="button"
          onClick={() => onRemoveTag(t)}
          className="inline-flex items-center gap-1 rounded-full bg-accent px-2 py-0.5 text-[0.6875rem] text-accent-foreground hover:bg-accent/80"
        >
          <HugeiconsIcon icon={HashtagIcon} strokeWidth={2} className="size-2.5 opacity-70" />
          {t}
          <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} className="size-2.5 opacity-70" />
        </button>
      ))}
      {search ? (
        <button
          type="button"
          onClick={onClearSearch}
          className="inline-flex items-center gap-1 rounded-full bg-input/30 px-2 py-0.5 text-[0.6875rem] hover:bg-input/50"
        >
          <HugeiconsIcon icon={Search01Icon} strokeWidth={2} className="size-2.5 opacity-70" />
          “{search}”
          <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} className="size-2.5 opacity-70" />
        </button>
      ) : null}
    </div>
  );
}

// ─── Scene grid ──────────────────────────────────────────────────────────

interface SceneGridAreaProps {
  items: SceneMeta[] | null;
  search: string;
  currentFolder: FolderMeta | null;
  onCreate: () => void;
  creating: boolean;
  folders: FolderMeta[] | null;
  onOpenScene: (id: string) => void;
  onRename: (s: SceneMeta) => void;
  onDelete: (s: SceneMeta) => void;
  onMove: (s: SceneMeta) => void;
  onEditTags: (s: SceneMeta) => void;
  onShare: (s: SceneMeta) => void;
}

function SceneGridArea({
  items,
  search,
  currentFolder,
  onCreate,
  creating,
  folders,
  onOpenScene,
  onRename,
  onDelete,
  onMove,
  onEditTags,
  onShare,
}: SceneGridAreaProps) {
  const folderById = useMemo(
    () => new Map((folders ?? []).map((f) => [f.id, f])),
    [folders]
  );

  if (items === null) return <SceneGridSkeleton />;
  if (items.length === 0) {
    return (
      <EmptyState
        search={search}
        currentFolderName={currentFolder?.name ?? null}
        onCreate={onCreate}
        creating={creating}
      />
    );
  }
  return (
    <ul className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {items.map((s) => (
        <SceneCard
          key={s.id}
          scene={s}
          folder={folderById.get(s.folderId) || null}
          onOpen={() => onOpenScene(s.id)}
          onRename={() => onRename(s)}
          onDelete={() => onDelete(s)}
          onMove={() => onMove(s)}
          onEditTags={() => onEditTags(s)}
          onShare={() => onShare(s)}
        />
      ))}
    </ul>
  );
}

// ─── Scene card ──────────────────────────────────────────────────────────

interface SceneCardProps {
  scene: SceneMeta;
  folder: FolderMeta | null;
  onOpen: () => void;
  onRename: () => void;
  onDelete: () => void;
  onMove: () => void;
  onEditTags: () => void;
  onShare: () => void;
}

function SceneCard({
  scene,
  folder,
  onOpen,
  onRename,
  onDelete,
  onMove,
  onEditTags,
  onShare,
}: SceneCardProps) {
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
            <HugeiconsIcon icon={Image01Icon} strokeWidth={1.5} className="size-10" />
          </div>
        )}
      </Link>
      <div className="flex items-center gap-2 px-3 py-2">
        <div className="min-w-0 flex-1">
          <button
            type="button"
            onClick={onOpen}
            className="block w-full truncate text-left text-xs/relaxed font-medium text-foreground hover:underline"
            title={scene.name}
          >
            {scene.name}
          </button>
          <div className="flex items-center gap-1 text-[0.6875rem] text-muted-foreground">
            {folder ? (
              <span className="truncate">{folder.name}</span>
            ) : null}
            {folder ? <span aria-hidden>·</span> : null}
            <span>{relTime(scene.updatedAt)}</span>
          </div>
          {scene.tags.length > 0 ? (
            <div className="mt-1 flex flex-wrap items-center gap-1">
              {scene.tags.slice(0, 2).map((t) => (
                <span
                  key={t}
                  className="inline-flex max-w-[8rem] items-center gap-0.5 rounded-full bg-accent/40 px-1.5 py-0.5 text-[0.625rem] text-accent-foreground"
                >
                  <HugeiconsIcon icon={HashtagIcon} strokeWidth={2} className="size-2.5 opacity-60" />
                  <span className="truncate">{t}</span>
                </span>
              ))}
              {scene.tags.length > 2 ? (
                <span className="text-[0.625rem] text-muted-foreground">
                  +{scene.tags.length - 2}
                </span>
              ) : null}
            </div>
          ) : null}
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
            <DropdownMenuItem
              render={
                <a href={scenes.downloadUrl(scene.id)} download>
                  <HugeiconsIcon icon={Download01Icon} strokeWidth={2} />
                  Download
                </a>
              }
            />
            <DropdownMenuItem onClick={onEditTags}>
              <HugeiconsIcon icon={HashtagIcon} strokeWidth={2} />
              Edit tags…
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onMove}>
              <HugeiconsIcon icon={FolderAddIcon} strokeWidth={2} />
              Move to…
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

// ─── Empty + skeleton ────────────────────────────────────────────────────

function EmptyState({
  search,
  currentFolderName,
  onCreate,
  creating,
}: {
  search: string;
  currentFolderName: string | null;
  onCreate: () => void;
  creating: boolean;
}) {
  if (search) {
    return (
      <div className="mx-auto mt-6 flex max-w-md flex-col items-center gap-2 rounded-lg border border-dashed border-border/60 px-6 py-16 text-center">
        <HugeiconsIcon icon={Search01Icon} strokeWidth={1.5} className="size-7 text-muted-foreground" />
        <div className="text-sm font-medium">No matches</div>
        <p className="text-xs/relaxed text-muted-foreground">
          No scenes match “{search}”.
        </p>
      </div>
    );
  }
  return (
    <div className="mx-auto mt-6 flex max-w-md flex-col items-center gap-3 rounded-lg border border-dashed border-border/60 px-6 py-16 text-center">
      <HugeiconsIcon icon={Image01Icon} strokeWidth={1.5} className="size-8 text-muted-foreground" />
      <div className="space-y-1">
        <div className="text-sm font-medium">
          {currentFolderName ? `“${currentFolderName}” is empty` : "No scenes yet"}
        </div>
        <p className="text-xs/relaxed text-muted-foreground">
          Start sketching — your first scene is one click away.
        </p>
      </div>
      <Button onClick={onCreate} disabled={creating} size="lg" className="mt-2">
        <HugeiconsIcon icon={PlusSignIcon} strokeWidth={2} />
        Create a scene
      </Button>
    </div>
  );
}

function SceneGridSkeleton() {
  return (
    <ul className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {Array.from({ length: 8 }).map((_, i) => (
        <li key={i} className="overflow-hidden rounded-lg bg-card ring-1 ring-foreground/10">
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

// ─── Scene rename / delete dialogs ───────────────────────────────────────

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
          <DialogDescription>Give your scene a more memorable name.</DialogDescription>
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
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
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

// ─── Folder dialogs ──────────────────────────────────────────────────────

function FolderCreateDialog({
  parentId,
  onOpenChange,
  onCreated,
}: {
  parentId: string | null;
  onOpenChange: (open: boolean) => void;
  onCreated: (m: FolderMeta) => void;
}) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    setBusy(true);
    try {
      const m = await folders.create({ name: trimmed, parentId });
      toast.success(`Created “${m.name}”.`);
      onCreated(m);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "could not create folder");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{parentId ? "New subfolder" : "New folder"}</DialogTitle>
          <DialogDescription>Folders organize your scenes. You can nest them.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="folder-name">Name</Label>
            <Input
              id="folder-name"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={busy}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy || !name.trim()}>
              Create
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function FolderRenameDialog({
  folder,
  onOpenChange,
  onRenamed,
}: {
  folder: FolderMeta;
  onOpenChange: (open: boolean) => void;
  onRenamed: (m: FolderMeta) => void;
}) {
  const [name, setName] = useState(folder.name);
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || trimmed === folder.name) {
      onOpenChange(false);
      return;
    }
    setBusy(true);
    try {
      const m = await folders.update(folder.id, { name: trimmed });
      toast.success(`Renamed to “${m.name}”.`);
      onRenamed(m);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "rename failed");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Rename folder</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="folder-rename">Name</Label>
            <Input
              id="folder-rename"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={busy}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
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

function FolderMoveDialog({
  folder,
  folders: allFolders,
  onOpenChange,
  onMoved,
}: {
  folder: FolderMeta;
  folders: FolderMeta[];
  onOpenChange: (open: boolean) => void;
  onMoved: () => void;
}) {
  // Forbidden = self + descendants. Compute via BFS.
  const forbidden = useMemo(() => {
    const out = new Set<string>([folder.id]);
    const childrenOf = new Map<string | null, FolderMeta[]>();
    for (const f of allFolders) {
      const arr = childrenOf.get(f.parentId) || [];
      arr.push(f);
      childrenOf.set(f.parentId, arr);
    }
    const queue: string[] = [folder.id];
    while (queue.length) {
      const id = queue.shift()!;
      for (const c of childrenOf.get(id) || []) {
        if (!out.has(c.id)) {
          out.add(c.id);
          queue.push(c.id);
        }
      }
    }
    return out;
  }, [folder.id, allFolders]);

  return (
    <MoveToFolderDialog
      open
      onOpenChange={onOpenChange}
      folders={allFolders}
      initialId={folder.parentId}
      forbiddenIds={forbidden}
      title={`Move “${folder.name}”`}
      description="Pick a new parent folder. Choose Inbox or another root to move it to the top level."
      onSubmit={async (folderId) => {
        try {
          // If user selects the folder's current parent, no-op.
          if (folderId === folder.parentId) return;
          // If user selected the same folder (shouldn't be possible —
          // forbiddenIds covers self), skip.
          if (folderId === folder.id) return;
          // Translate "selected an Inbox or root-level folder" semantics:
          // moving to the Inbox is treated as "make it a sibling of Inbox"
          // i.e. parentId = null. Other selections become the literal
          // parentId.
          const parentId =
            allFolders.find((f) => f.id === folderId)?.isDefault && folder.parentId !== folderId
              ? null
              : folderId;
          await folders.update(folder.id, { parentId });
          toast.success("Moved.");
          onMoved();
        } catch (e) {
          toast.error(e instanceof ApiError ? e.message : "could not move");
        }
      }}
    />
  );
}

function FolderDeleteDialog({
  folder,
  onOpenChange,
  onDeleted,
}: {
  folder: FolderMeta;
  onOpenChange: (open: boolean) => void;
  onDeleted: () => void;
}) {
  const [busy, setBusy] = useState(false);
  async function confirm() {
    setBusy(true);
    try {
      await folders.delete(folder.id);
      toast.success(`Deleted “${folder.name}”.`);
      onDeleted();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "could not delete");
    } finally {
      setBusy(false);
    }
  }
  return (
    <AlertDialog open onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete folder?</AlertDialogTitle>
          <AlertDialogDescription>
            “{folder.name}” will be removed. Its scenes and subfolders move up
            one level (to {folder.parentId ? "the parent folder" : "Inbox"}).
            Active share links for this folder are revoked.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={(e) => {
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

// ─── Helpers ──────────────────────────────────────────────────────────────

function useDebouncedValue<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(id);
  }, [value, delay]);
  return debounced;
}

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
