// Dashboard — file-explorer shell.
//
// Owns:
//   - URL state (`?folder=`).
//   - Dialog state (which scene/folder a rename / delete / move / share /
//     edit-tags dialog is currently targeting).
//   - The `actions` table handed to the Browse view's right-click menu.
//
// Does NOT own data fetching: `<BrowseView>` consumes the explorer
// query hooks (`useFolders`, `useScenes`) directly. Mutations from
// the dialog hooks invalidate those queries, so the view refreshes
// without any manual `refreshTick` plumbing.

import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";

import { PaperSurface } from "@/components/PaperSurface";
import { useMe } from "@/features/auth/hooks";
import { BrowseView, ExplorerHeader, type ItemMenuActions } from "@/features/explorer";
import {
  useCreateScene,
  useFolders,
  useSetSceneTags,
  useTags,
  useUpdateFolder,
} from "@/features/explorer/hooks";
import { ShareDialog } from "@/features/sharing/ShareDialog";
import { TagEditDialog } from "@/features/tags/TagEditDialog";
import type { FolderMeta, SceneMeta } from "@/lib/api/client";
import { errorMessage } from "@/lib/errors";

import { FolderCreateDialog } from "./dialogs/FolderCreateDialog";
import { FolderDeleteDialog } from "./dialogs/FolderDeleteDialog";
import { FolderMoveDialog } from "./dialogs/FolderMoveDialog";
import { FolderRenameDialog } from "./dialogs/FolderRenameDialog";
import { SceneDeleteDialog } from "./dialogs/SceneDeleteDialog";
import { SceneMoveDialog } from "./dialogs/SceneMoveDialog";
import { SceneRenameDialog } from "./dialogs/SceneRenameDialog";

type ShareTarget = { kind: "scene"; scene: SceneMeta } | { kind: "folder"; folder: FolderMeta };

export default function DashboardPage() {
  const me = useMe();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const folderId = searchParams.get("folder");

  const folders = useFolders();
  const tags = useTags();
  const createScene = useCreateScene();
  const setSceneTags = useSetSceneTags();
  const updateFolder = useUpdateFolder();

  // ─── URL helpers ──────────────────────────────────────────────────
  function setFolder(id: string | null) {
    const sp = new URLSearchParams();
    if (id) sp.set("folder", id);
    setSearchParams(sp, { replace: true });
  }

  // ─── Dialog state ─────────────────────────────────────────────────
  const [renameSceneTarget, setRenameSceneTarget] = useState<SceneMeta | null>(null);
  const [deleteSceneTarget, setDeleteSceneTarget] = useState<SceneMeta | null>(null);
  const [moveSceneTarget, setMoveSceneTarget] = useState<SceneMeta | null>(null);
  const [tagSceneTarget, setTagSceneTarget] = useState<SceneMeta | null>(null);
  const [shareTarget, setShareTarget] = useState<ShareTarget | null>(null);
  const [folderRenameTarget, setFolderRenameTarget] = useState<FolderMeta | null>(null);
  const [folderMoveTarget, setFolderMoveTarget] = useState<FolderMeta | null>(null);
  const [folderTagsTarget, setFolderTagsTarget] = useState<FolderMeta | null>(null);
  const [folderDeleteTarget, setFolderDeleteTarget] = useState<FolderMeta | null>(null);
  const [folderCreate, setFolderCreate] = useState<{ parentId: string | null } | null>(null);

  async function newScene(parentFolderId: string | null) {
    if (createScene.isPending) return;
    try {
      const m = await createScene.mutateAsync({
        folderId: parentFolderId ?? undefined,
      });
      navigate(`/s/${m.id}`);
    } catch (e) {
      toast.error(errorMessage(e, "failed to create scene"));
    }
  }

  // ─── Menu actions handed to every view ────────────────────────────
  const tagSuggestions = useMemo(() => (tags.data || []).map((t) => t.name), [tags.data]);
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
    createSceneIn: (parentFolderId) => void newScene(parentFolderId),
    createFolderIn: (parentId) => setFolderCreate({ parentId }),
  };

  if (!me.data) return null;

  const folderList = folders.data ?? null;

  return (
    <PaperSurface variant="page" className="flex flex-col">
      <ExplorerHeader user={me.data} />

      <main className="flex flex-1 flex-col min-h-0">
        <BrowseView
          folderId={folderId}
          onChangeFolder={setFolder}
          folders={folderList}
          actions={actions}
        />
      </main>

      {/* ─── Scene dialogs ─── */}
      <SceneRenameDialog
        scene={renameSceneTarget}
        onOpenChange={(o) => !o && setRenameSceneTarget(null)}
      />
      <SceneDeleteDialog
        scene={deleteSceneTarget}
        onOpenChange={(o) => !o && setDeleteSceneTarget(null)}
      />
      {folderList ? (
        <SceneMoveDialog
          scene={moveSceneTarget}
          folders={folderList}
          onOpenChange={(o) => !o && setMoveSceneTarget(null)}
        />
      ) : null}
      {tagSceneTarget ? (
        <TagEditDialog
          open
          onOpenChange={(o) => !o && setTagSceneTarget(null)}
          initialTags={tagSceneTarget.tags}
          suggestions={tagSuggestions}
          title={`Tags for "${tagSceneTarget.name}"`}
          onSave={async (next) =>
            (
              await setSceneTags.mutateAsync({
                id: tagSceneTarget.id,
                tags: next,
              })
            ).tags
          }
        />
      ) : null}

      {/* ─── Share dialog (scene or folder) ─── */}
      {shareTarget ? (
        <ShareDialog
          open
          onOpenChange={(o) => !o && setShareTarget(null)}
          targetType={shareTarget.kind}
          targetId={shareTarget.kind === "scene" ? shareTarget.scene.id : shareTarget.folder.id}
          targetName={
            shareTarget.kind === "scene" ? shareTarget.scene.name : shareTarget.folder.name
          }
        />
      ) : null}

      {/* ─── Folder dialogs ─── */}
      {folderCreate ? (
        <FolderCreateDialog
          open
          parentId={folderCreate.parentId}
          onOpenChange={(o) => !o && setFolderCreate(null)}
        />
      ) : null}
      <FolderRenameDialog
        folder={folderRenameTarget}
        onOpenChange={(o) => !o && setFolderRenameTarget(null)}
      />
      {folderList ? (
        <FolderMoveDialog
          folder={folderMoveTarget}
          folders={folderList}
          onOpenChange={(o) => !o && setFolderMoveTarget(null)}
        />
      ) : null}
      {folderTagsTarget ? (
        <TagEditDialog
          open
          onOpenChange={(o) => !o && setFolderTagsTarget(null)}
          initialTags={folderTagsTarget.tags}
          suggestions={tagSuggestions}
          title={`Tags for "${folderTagsTarget.name}"`}
          onSave={async (next) =>
            (
              await updateFolder.mutateAsync({
                id: folderTagsTarget.id,
                patch: { tags: next },
              })
            ).tags
          }
        />
      ) : null}
      <FolderDeleteDialog
        folder={folderDeleteTarget}
        onOpenChange={(o) => !o && setFolderDeleteTarget(null)}
        onDeleted={(deleted) => {
          // If the user was viewing the deleted folder (or a child of it),
          // pop up to the root since the URL now points at nothing.
          if (folderId === deleted.id) {
            setFolder(null);
            return;
          }
          // Was the active folder a descendant of the deleted one?
          const wasDescendant =
            !!folderId && folderList?.some((f) => f.id === folderId && f.parentId === deleted.id);
          if (wasDescendant) setFolder(null);
        }}
      />
    </PaperSurface>
  );
}
