// Dashboard — sketchbook desk with drill-down folder navigation.
//
// Layout: paper page → DeskHeader (logo + search + new + user menu) →
// RootFolderTabStrip (Inbox + user roots + "+") → optional Breadcrumb →
// TagFilterStrip → mixed grid of subfolders (FolderTabs) and scenes
// (SceneCards) for the current scope.
//
// State + URL plumbing is unchanged from the prior dashboard: scope,
// active tags, and search live in the query string so views are
// linkable and survive reloads. Mutations re-run the same loaders so
// counts and the grid stay in sync.

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  ArrowRight01Icon,
  Cancel01Icon,
  Delete02Icon,
  Download01Icon,
  Edit02Icon,
  FolderAddIcon,
  HashtagIcon,
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
import { PaperSurface } from "@/components/PaperSurface";
import {
  DeskHeader,
  EmptyDeskNote,
  FolderTab,
  RootFolderTabStrip,
  SceneCard,
  TagFilterStrip,
} from "@/components/sketch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { folderPath } from "@/components/FolderTree";
import { MoveToFolderDialog } from "@/components/MoveToFolderDialog";
import { TagEditDialog } from "@/components/TagEditDialog";
import { ShareDialog } from "@/components/ShareDialog";
import { cn } from "@/lib/utils";

interface DashboardProps {
  user: User;
  onLogout: () => void;
}

type Scope = { kind: "all" } | { kind: "folder"; id: string; recursive: boolean };

export default function Dashboard({ user, onLogout }: DashboardProps) {
  const [folderList, setFolderList] = useState<FolderMeta[] | null>(null);
  const [tagList, setTagList] = useState<Tag[] | null>(null);
  const [items, setItems] = useState<SceneMeta[] | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);

  // ─── URL state ────────────────────────────────────────────────────
  const scope: Scope = useMemo(() => {
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

  function setScope(next: Scope) {
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
  const [folderRenameTarget, setFolderRenameTarget] =
    useState<FolderMeta | null>(null);
  const [folderMoveTarget, setFolderMoveTarget] = useState<FolderMeta | null>(
    null
  );
  const [folderTagsTarget, setFolderTagsTarget] = useState<FolderMeta | null>(
    null
  );
  const [folderDeleteTarget, setFolderDeleteTarget] =
    useState<FolderMeta | null>(null);
  const [folderCreate, setFolderCreate] = useState<{
    parentId: string | null;
  } | null>(null);

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

  const tagSuggestions = useMemo(
    () => (tagList || []).map((t) => t.name),
    [tagList]
  );
  const currentFolder = useMemo(() => {
    if (scope.kind !== "folder" || !folderList) return null;
    return folderList.find((f) => f.id === scope.id) ?? null;
  }, [scope, folderList]);
  const breadcrumb = useMemo(() => {
    if (!folderList || scope.kind !== "folder") return [];
    return folderPath(folderList, scope.id);
  }, [folderList, scope]);
  const subfolders = useMemo(() => {
    if (scope.kind !== "folder" || !folderList) return [];
    return folderList
      .filter((f) => f.parentId === scope.id)
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [scope, folderList]);

  // Selected target name for share dialog.
  const shareName =
    shareTarget?.kind === "scene"
      ? shareTarget.scene.name
      : shareTarget?.kind === "folder"
        ? shareTarget.folder.name
        : "";

  return (
    <PaperSurface variant="page">
      <DeskHeader
        user={user}
        search={search}
        onSearchChange={setSearch}
        onCreateScene={createNew}
        creating={creating}
        onLogout={onLogout}
      />

      <RootFolderTabStrip
        folders={folderList}
        activeId={scope.kind === "folder" ? scope.id : null}
        allActive={scope.kind === "all"}
        onSelectAll={() => setScope({ kind: "all" })}
        onSelectFolder={(id) =>
          setScope({ kind: "folder", id, recursive: false })
        }
        onCreateRootFolder={() => setFolderCreate({ parentId: null })}
      />

      {/* Hairline rough divider between tabs row and content */}
      <div className="px-6">
        <div className="border-t border-ink-soft/15" />
      </div>

      <main className="px-6 pb-16 pt-4">
        {scope.kind === "folder" && breadcrumb.length > 0 && (
          <Breadcrumb
            breadcrumb={breadcrumb}
            scope={scope}
            onJump={(id) =>
              setScope({
                kind: "folder",
                id,
                recursive: scope.kind === "folder" ? scope.recursive : false,
              })
            }
            onAll={() => setScope({ kind: "all" })}
          />
        )}

        <TagFilterStrip
          tags={tagList}
          active={activeTags}
          onToggle={toggleTag}
        />

        <ActiveFilters
          search={search}
          activeTags={activeTags}
          onClearSearch={() => setSearch("")}
          onRemoveTag={toggleTag}
        />

        <DeskGrid
          items={items}
          subfolders={subfolders}
          search={search}
          currentFolder={currentFolder}
          inFolder={scope.kind === "folder"}
          folderById={folderList}
          onCreate={createNew}
          creating={creating}
          onCreateSubfolder={() =>
            scope.kind === "folder" &&
            setFolderCreate({ parentId: scope.id })
          }
          onOpenFolder={(id) =>
            setScope({ kind: "folder", id, recursive: false })
          }
          onOpenScene={(id) => navigate(`/s/${id}`)}
          onSceneAction={{
            rename: setRenameTarget,
            delete: setDeleteTarget,
            move: setMoveTarget,
            editTags: setTagSceneTarget,
            share: (s) => setShareTarget({ kind: "scene", scene: s }),
          }}
          onFolderAction={{
            rename: setFolderRenameTarget,
            move: setFolderMoveTarget,
            editTags: setFolderTagsTarget,
            delete: setFolderDeleteTarget,
            share: (f) => setShareTarget({ kind: "folder", folder: f }),
            createSubfolder: (f) => setFolderCreate({ parentId: f.id }),
          }}
        />
      </main>

      {/* ─── Dialogs (logic preserved from prior implementation) ─── */}
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
          void refreshFolders();
        }}
      />

      {folderList && moveTarget ? (
        <MoveToFolderDialog
          open={!!moveTarget}
          onOpenChange={(o) => !o && setMoveTarget(null)}
          folders={folderList}
          initialId={moveTarget.folderId}
          title={`Move "${moveTarget.name}"`}
          description="Pick a destination folder."
          onSubmit={async (folderId) => {
            try {
              const updated = await scenes.move(moveTarget.id, folderId);
              setItems((prev) =>
                prev
                  ? prev.map((x) => (x.id === updated.id ? updated : x))
                  : prev
              );
              toast.success("Moved.");
              await refreshFolders();
            } catch (e) {
              toast.error(e instanceof ApiError ? e.message : "could not move");
            }
          }}
        />
      ) : null}

      {tagSceneTarget ? (
        <TagEditDialog
          open={!!tagSceneTarget}
          onOpenChange={(o) => !o && setTagSceneTarget(null)}
          initialTags={tagSceneTarget.tags}
          suggestions={tagSuggestions}
          title={`Tags for "${tagSceneTarget.name}"`}
          onSave={async (next) => {
            const result = await scenes.setTags(tagSceneTarget.id, next);
            return result.tags;
          }}
          onSaved={async (next) => {
            setItems((prev) =>
              prev
                ? prev.map((x) =>
                    x.id === tagSceneTarget.id ? { ...x, tags: next } : x
                  )
                : prev
            );
            await refreshTags();
          }}
        />
      ) : null}

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
          title={`Tags for "${folderTagsTarget.name}"`}
          onSave={async (next) => {
            const updated = await folders.update(folderTagsTarget.id, {
              tags: next,
            });
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
            if (
              scope.kind === "folder" &&
              scope.id === folderDeleteTarget.id
            ) {
              setScope({ kind: "all" });
            }
          }}
        />
      ) : null}
    </PaperSurface>
  );
}

// ─── Breadcrumb + active filter chips ────────────────────────────────────

function Breadcrumb({
  breadcrumb,
  scope,
  onJump,
  onAll,
}: {
  breadcrumb: FolderMeta[];
  scope: Scope;
  onJump: (id: string) => void;
  onAll: () => void;
}) {
  return (
    <nav
      aria-label="Folder path"
      className="flex items-center gap-1 px-6 py-1 font-hand text-base text-ink-soft"
    >
      <button
        type="button"
        onClick={onAll}
        className={cn(
          "rounded px-1 py-0.5 transition-colors hover:text-ink",
          scope.kind === "all" && "text-ink"
        )}
      >
        All scenes
      </button>
      {breadcrumb.map((f, i) => (
        <span key={f.id} className="flex items-center gap-1">
          <HugeiconsIcon
            icon={ArrowRight01Icon}
            strokeWidth={1.5}
            className="size-3 opacity-50"
          />
          <button
            type="button"
            onClick={() => onJump(f.id)}
            className={cn(
              "rounded px-1 py-0.5 transition-colors hover:text-ink",
              i === breadcrumb.length - 1 && "text-ink"
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
    <div className="flex flex-wrap items-center gap-1.5 px-6 pb-2 pt-1">
      <span className="font-hand text-sm text-ink-muted">Filtering by:</span>
      {activeTags.map((t) => (
        <button
          key={t}
          type="button"
          onClick={() => onRemoveTag(t)}
          className="inline-flex items-center gap-1 rounded-full bg-manila-soft px-2 py-0.5 font-sans text-[0.6875rem] text-ink hover:bg-manila"
        >
          <HugeiconsIcon
            icon={HashtagIcon}
            strokeWidth={2}
            className="size-2.5 opacity-70"
          />
          {t}
          <HugeiconsIcon
            icon={Cancel01Icon}
            strokeWidth={2}
            className="size-2.5 opacity-70"
          />
        </button>
      ))}
      {search ? (
        <button
          type="button"
          onClick={onClearSearch}
          className="inline-flex items-center gap-1 rounded-full bg-paper-edge px-2 py-0.5 font-sans text-[0.6875rem] text-ink-soft hover:bg-paper-edge/80"
        >
          <HugeiconsIcon
            icon={Search01Icon}
            strokeWidth={2}
            className="size-2.5 opacity-70"
          />
          "{search}"
          <HugeiconsIcon
            icon={Cancel01Icon}
            strokeWidth={2}
            className="size-2.5 opacity-70"
          />
        </button>
      ) : null}
    </div>
  );
}

// ─── Mixed grid: subfolders + scenes ─────────────────────────────────────

interface SceneActionHandlers {
  rename: (s: SceneMeta) => void;
  delete: (s: SceneMeta) => void;
  move: (s: SceneMeta) => void;
  editTags: (s: SceneMeta) => void;
  share: (s: SceneMeta) => void;
}

interface FolderActionHandlers {
  rename: (f: FolderMeta) => void;
  move: (f: FolderMeta) => void;
  editTags: (f: FolderMeta) => void;
  delete: (f: FolderMeta) => void;
  share: (f: FolderMeta) => void;
  createSubfolder: (f: FolderMeta) => void;
}

interface DeskGridProps {
  items: SceneMeta[] | null;
  subfolders: FolderMeta[];
  search: string;
  currentFolder: FolderMeta | null;
  inFolder: boolean;
  folderById: FolderMeta[] | null;
  onCreate: () => void;
  creating: boolean;
  onCreateSubfolder: () => void;
  onOpenFolder: (id: string) => void;
  onOpenScene: (id: string) => void;
  onSceneAction: SceneActionHandlers;
  onFolderAction: FolderActionHandlers;
}

function DeskGrid({
  items,
  subfolders,
  currentFolder,
  inFolder,
  search,
  folderById,
  onCreate,
  creating,
  onCreateSubfolder,
  onOpenFolder,
  onOpenScene,
  onSceneAction,
  onFolderAction,
}: DeskGridProps) {
  const folderMap = useMemo(
    () => new Map((folderById ?? []).map((f) => [f.id, f])),
    [folderById]
  );

  if (items === null) {
    return <DeskGridSkeleton />;
  }

  const noScenes = items.length === 0;
  const noSubfolders = subfolders.length === 0;

  // ─── Empty / zero states ───
  if (noScenes && noSubfolders) {
    if (search) {
      return (
        <EmptyDeskNote
          seed="search-empty"
          title="Nothing here"
          body={
            <>
              No scenes match{" "}
              <span className="font-heading text-ink">"{search}"</span>.
            </>
          }
        />
      );
    }
    return (
      <EmptyDeskNote
        seed={`empty-${currentFolder?.id ?? "all"}`}
        title={
          currentFolder ? `"${currentFolder.name}" is empty` : "No scenes yet"
        }
        body="Start sketching — your first scene is one click away."
        action={
          <div className="flex flex-wrap items-center justify-center gap-2">
            <Button onClick={onCreate} disabled={creating} size="lg">
              <HugeiconsIcon icon={PlusSignIcon} strokeWidth={2} />
              New scene
            </Button>
            {inFolder && (
              <Button
                onClick={onCreateSubfolder}
                variant="outline"
                size="lg"
              >
                <HugeiconsIcon icon={FolderAddIcon} strokeWidth={2} />
                New subfolder
              </Button>
            )}
          </div>
        }
      />
    );
  }

  return (
    <div className="space-y-6">
      {!noSubfolders && (
        <section aria-label="Subfolders">
          <h3 className="px-6 pb-2 font-heading text-lg text-ink-soft">
            Folders
          </h3>
          <div className="grid grid-cols-2 gap-4 px-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {subfolders.map((f) => (
              <FolderTab
                key={f.id}
                id={f.id}
                name={f.name}
                accent={f.isDefault ? "graphite" : "manila"}
                isInbox={f.isDefault}
                count={f.sceneCount}
                variant="grid"
                onClick={() => onOpenFolder(f.id)}
                actions={
                  <FolderActionsMenu
                    folder={f}
                    onRename={() => onFolderAction.rename(f)}
                    onMove={() => onFolderAction.move(f)}
                    onEditTags={() => onFolderAction.editTags(f)}
                    onShare={() => onFolderAction.share(f)}
                    onDelete={() => onFolderAction.delete(f)}
                    onCreateSubfolder={() =>
                      onFolderAction.createSubfolder(f)
                    }
                  />
                }
              />
            ))}
            {inFolder && (
              <button
                type="button"
                onClick={onCreateSubfolder}
                aria-label="New subfolder"
                className="group/new relative flex h-32 min-w-48 items-center justify-center gap-2 font-heading text-sm text-ink-soft transition-colors hover:text-vermillion"
              >
                <span
                  aria-hidden
                  className="absolute inset-0 rounded-md border border-dashed border-ink-soft/40 transition-colors group-hover/new:border-vermillion/60"
                />
                <HugeiconsIcon
                  icon={FolderAddIcon}
                  strokeWidth={1.6}
                  className="size-5"
                />
                New subfolder
              </button>
            )}
          </div>
        </section>
      )}

      {!noScenes && (
        <section aria-label="Scenes">
          <h3 className="px-6 pb-2 font-heading text-lg text-ink-soft">
            Scenes
          </h3>
          <ul className="grid grid-cols-1 gap-5 px-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {items.map((s) => {
              const folder = folderMap.get(s.folderId) ?? null;
              return (
                <SceneCard
                  key={s.id}
                  id={s.id}
                  name={s.name}
                  hasThumb={s.hasThumb}
                  thumbUrl={`/api/scenes/${s.id}/thumb?v=${s.version}`}
                  folderName={folder?.name ?? null}
                  updatedAtLabel={relTime(s.updatedAt)}
                  tags={s.tags}
                  href={`/s/${s.id}`}
                  onOpen={() => onOpenScene(s.id)}
                  actions={
                    <SceneActionsMenu
                      scene={s}
                      onShare={() => onSceneAction.share(s)}
                      onEditTags={() => onSceneAction.editTags(s)}
                      onMove={() => onSceneAction.move(s)}
                      onRename={() => onSceneAction.rename(s)}
                      onDelete={() => onSceneAction.delete(s)}
                    />
                  }
                />
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}

function DeskGridSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-5 px-6 pt-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {Array.from({ length: 8 }).map((_, i) => (
        <div
          key={i}
          className="aspect-[4/3] w-full animate-pulse rounded-md bg-paper-edge/50"
        />
      ))}
    </div>
  );
}

// ─── Per-card action menus ───────────────────────────────────────────────

function SceneActionsMenu({
  scene,
  onShare,
  onEditTags,
  onMove,
  onRename,
  onDelete,
}: {
  scene: SceneMeta;
  onShare: () => void;
  onEditTags: () => void;
  onMove: () => void;
  onRename: () => void;
  onDelete: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Actions for ${scene.name}`}
            className="size-7"
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
  );
}

function FolderActionsMenu({
  folder,
  onRename,
  onMove,
  onEditTags,
  onShare,
  onDelete,
  onCreateSubfolder,
}: {
  folder: FolderMeta;
  onRename: () => void;
  onMove: () => void;
  onEditTags: () => void;
  onShare: () => void;
  onDelete: () => void;
  onCreateSubfolder: () => void;
}) {
  const isInbox = folder.isDefault;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Actions for ${folder.name}`}
            className="size-7 bg-paper-elev/80"
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
        <DropdownMenuItem onClick={onCreateSubfolder}>
          <HugeiconsIcon icon={FolderAddIcon} strokeWidth={2} />
          New subfolder
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onEditTags}>
          <HugeiconsIcon icon={HashtagIcon} strokeWidth={2} />
          Edit tags…
        </DropdownMenuItem>
        {!isInbox && (
          <>
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
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
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
      toast.success(`Renamed to "${updated.name}".`);
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
      toast.success(`Deleted "${scene.name}".`);
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
            "{scene?.name}" will be permanently removed. This cannot be undone.
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
      toast.success(`Created "${m.name}".`);
      onCreated(m);
    } catch (e) {
      toast.error(
        e instanceof ApiError ? e.message : "could not create folder"
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{parentId ? "New subfolder" : "New folder"}</DialogTitle>
          <DialogDescription>
            Folders organize your scenes. You can nest them.
          </DialogDescription>
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
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={busy}
            >
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
      toast.success(`Renamed to "${m.name}".`);
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
      title={`Move "${folder.name}"`}
      description="Pick a new parent folder. Choose Inbox or another root to move it to the top level."
      onSubmit={async (folderId) => {
        try {
          if (folderId === folder.parentId) return;
          if (folderId === folder.id) return;
          const parentId =
            allFolders.find((f) => f.id === folderId)?.isDefault &&
            folder.parentId !== folderId
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
      toast.success(`Deleted "${folder.name}".`);
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
            "{folder.name}" will be removed. Its scenes and subfolders move up
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
