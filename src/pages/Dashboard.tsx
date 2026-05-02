// Dashboard — file-explorer shell. Picks one of three views (Browse,
// Recent, Search) based on `?view=` and renders it inside the shared
// `<ExplorerHeader>`. Owns the dialog state for every per-item action
// (rename, delete, move, share, edit-tags) and the folder list +
// tag list that all three views consume.
//
// URL plumbing:
//   ?view=browse&folder=<id>           — Browse pane scoped to that folder
//   ?view=recent                       — Recent pane
//   ?view=search&q=<text>&tag=<name>   — Search pane
//
// `view` defaults to `browse`. `folder`, `q`, and `tag` are only
// consulted in their respective views; switching views drops the others
// from the URL so links stay clean.

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";

import {
  ApiError,
  FolderMeta,
  SceneMeta,
  Tag,
  User,
  folders as foldersApi,
  scenes as scenesApi,
  tags as tagsApi,
} from "@/api";
import { PaperSurface } from "@/components/PaperSurface";
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
import { MoveToFolderDialog } from "@/components/MoveToFolderDialog";
import { TagEditDialog } from "@/components/TagEditDialog";
import { ShareDialog } from "@/components/ShareDialog";
import {
  BrowseView,
  ExplorerHeader,
  RecentView,
  SearchView,
  type ExplorerView,
  type ItemMenuActions,
} from "@/components/explorer";

interface DashboardProps {
  user: User;
  onLogout: () => void;
}

export default function Dashboard({ user, onLogout }: DashboardProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const view = parseView(searchParams.get("view"));
  const folderId = searchParams.get("folder");
  const search = searchParams.get("q") || "";
  const activeTags = useMemo(() => searchParams.getAll("tag"), [searchParams]);

  // ─── Lists shared across all views ────────────────────────────────
  const [folderList, setFolderList] = useState<FolderMeta[] | null>(null);
  const [tagList, setTagList] = useState<Tag[] | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);

  const refreshFolders = useCallback(async () => {
    try {
      setFolderList(await foldersApi.list());
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

  useEffect(() => {
    void refreshFolders();
    void refreshTags();
  }, [refreshFolders, refreshTags]);

  // ─── URL helpers ──────────────────────────────────────────────────
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

  function setView(next: ExplorerView) {
    // Clear view-specific params so links stay clean.
    setSearchParams(
      next === "browse" ? new URLSearchParams() : new URLSearchParams({ view: next }),
      { replace: true }
    );
  }
  function setFolder(id: string | null) {
    if (id === null) patchParams({ view: "browse", folder: null });
    else patchParams({ view: "browse", folder: id });
  }
  function setSearch(q: string) {
    patchParams({ q: q || null });
  }
  function toggleTag(name: string) {
    const next = activeTags.includes(name)
      ? activeTags.filter((t) => t !== name)
      : [...activeTags, name];
    patchParams({ tag: next.length ? next : null });
  }

  function bumpRefresh() {
    setRefreshTick((n) => n + 1);
  }

  // ─── Dialog state ─────────────────────────────────────────────────
  const [renameSceneTarget, setRenameSceneTarget] = useState<SceneMeta | null>(null);
  const [deleteSceneTarget, setDeleteSceneTarget] = useState<SceneMeta | null>(null);
  const [moveSceneTarget, setMoveSceneTarget] = useState<SceneMeta | null>(null);
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
  const [creatingScene, setCreatingScene] = useState(false);

  async function createScene(parentFolderId: string | null) {
    if (creatingScene) return;
    setCreatingScene(true);
    try {
      const m = await scenesApi.create({ folderId: parentFolderId ?? undefined });
      navigate(`/s/${m.id}`);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "failed to create scene");
    } finally {
      setCreatingScene(false);
    }
  }

  // ─── Menu actions handed to every view ────────────────────────────
  const tagSuggestions = useMemo(
    () => (tagList || []).map((t) => t.name),
    [tagList]
  );
  const actions: ItemMenuActions = {
    openScene: (s) => navigate(`/s/${s.id}`),
    openFolder: (f) => setFolder(f.id),
    shareScene: (s) => setShareTarget({ kind: "scene", scene: s }),
    shareFolder: (f) => setShareTarget({ kind: "folder", folder: f }),
    editSceneTags: (s) => setTagSceneTarget(s),
    editFolderTags: (f) => setFolderTagsTarget(f),
    moveScene: (s) => setMoveSceneTarget(s),
    moveFolder: (f) => setFolderMoveTarget(f),
    renameScene: (s) => setRenameSceneTarget(s),
    renameFolder: (f) => setFolderRenameTarget(f),
    deleteScene: (s) => setDeleteSceneTarget(s),
    deleteFolder: (f) => setFolderDeleteTarget(f),
    createSceneIn: (parentFolderId) => void createScene(parentFolderId),
    createFolderIn: (parentId) => setFolderCreate({ parentId }),
  };

  const shareName =
    shareTarget?.kind === "scene"
      ? shareTarget.scene.name
      : shareTarget?.kind === "folder"
        ? shareTarget.folder.name
        : "";

  return (
    <PaperSurface variant="page">
      <ExplorerHeader
        user={user}
        view={view}
        onChangeView={setView}
        onLogout={onLogout}
      />

      <div className="px-6">
        <div className="border-t border-ink-soft/15" />
      </div>

      <main className="pt-2">
        {view === "browse" && (
          <BrowseView
            folderId={folderId}
            onChangeFolder={setFolder}
            folders={folderList}
            actions={actions}
            refreshTick={refreshTick}
          />
        )}
        {view === "recent" && (
          <RecentView
            folders={folderList}
            actions={actions}
            refreshTick={refreshTick}
          />
        )}
        {view === "search" && (
          <SearchView
            query={search}
            onQueryChange={setSearch}
            activeTags={activeTags}
            onToggleTag={toggleTag}
            tags={tagList}
            folders={folderList}
            actions={actions}
            refreshTick={refreshTick}
          />
        )}
      </main>

      {/* ─── Scene dialogs ─── */}
      <SceneRenameDialog
        scene={renameSceneTarget}
        onOpenChange={(o) => !o && setRenameSceneTarget(null)}
        onRenamed={() => {
          setRenameSceneTarget(null);
          bumpRefresh();
        }}
      />
      <SceneDeleteDialog
        scene={deleteSceneTarget}
        onOpenChange={(o) => !o && setDeleteSceneTarget(null)}
        onDeleted={() => {
          setDeleteSceneTarget(null);
          bumpRefresh();
          void refreshFolders();
        }}
      />
      {folderList && moveSceneTarget ? (
        <MoveToFolderDialog
          open={!!moveSceneTarget}
          onOpenChange={(o) => !o && setMoveSceneTarget(null)}
          folders={folderList}
          initialId={moveSceneTarget.folderId}
          title={`Move "${moveSceneTarget.name}"`}
          description="Pick a destination folder, or choose Top level for the root."
          onSubmit={async (destFolderId) => {
            try {
              await scenesApi.move(moveSceneTarget.id, destFolderId);
              toast.success("Moved.");
              bumpRefresh();
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
          onSave={async (next) => (await scenesApi.setTags(tagSceneTarget.id, next)).tags}
          onSaved={async () => {
            bumpRefresh();
            await refreshTags();
          }}
        />
      ) : null}

      {/* ─── Share dialog (scene or folder) ─── */}
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

      {/* ─── Folder dialogs ─── */}
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
            const updated = await foldersApi.update(folderTagsTarget.id, {
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
            const wasOpen =
              folderId === folderDeleteTarget.id ||
              (folderList?.some(
                (f) => f.parentId === folderDeleteTarget.id && f.id === folderId
              ) ??
                false);
            setFolderDeleteTarget(null);
            await refreshFolders();
            bumpRefresh();
            if (wasOpen) setFolder(null);
          }}
        />
      ) : null}
    </PaperSurface>
  );
}

function parseView(raw: string | null): ExplorerView {
  if (raw === "recent" || raw === "search") return raw;
  return "browse";
}

// ─── Scene rename / delete dialogs ───────────────────────────────────────

function SceneRenameDialog({
  scene,
  onOpenChange,
  onRenamed,
}: {
  scene: SceneMeta | null;
  onOpenChange: (open: boolean) => void;
  onRenamed: (m: SceneMeta) => void;
}) {
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
      const updated = await scenesApi.rename(scene.id, next);
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
          <DialogDescription>
            Give your scene a more memorable name.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="scene-rename">Name</Label>
            <Input
              id="scene-rename"
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

function SceneDeleteDialog({
  scene,
  onOpenChange,
  onDeleted,
}: {
  scene: SceneMeta | null;
  onOpenChange: (open: boolean) => void;
  onDeleted: (id: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  async function confirm() {
    if (!scene) return;
    setBusy(true);
    try {
      await scenesApi.delete(scene.id);
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
      const m = await foldersApi.create({ name: trimmed, parentId });
      toast.success(`Created "${m.name}".`);
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
      const m = await foldersApi.update(folder.id, { name: trimmed });
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
      description="Pick a new parent folder, or choose Top level for the root."
      onSubmit={async (parentId) => {
        try {
          if (parentId === folder.parentId) return;
          if (parentId === folder.id) return;
          await foldersApi.update(folder.id, { parentId });
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
      await foldersApi.delete(folder.id);
      toast.success(`Deleted "${folder.name}".`);
      onDeleted();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "could not delete");
    } finally {
      setBusy(false);
    }
  }
  const destination = folder.parentId
    ? "the parent folder"
    : "the top level";
  return (
    <AlertDialog open onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete folder?</AlertDialogTitle>
          <AlertDialogDescription>
            "{folder.name}" will be removed. Its scenes and subfolders move up
            one level (to {destination}). Active share links for this folder are
            revoked.
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
