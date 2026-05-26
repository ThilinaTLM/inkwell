// Dashboard — file-explorer shell.
//
// Owns:
//   - URL state (path: `/` for root, `/folders/:folderId` for a folder).
//   - Dialog state (which file/folder a rename / delete / move / share /
//     edit-tags dialog is currently targeting).
//   - The `actions` table handed to the Browse view's right-click menu.
//
// Folder navigation pushes a new history entry (no `replace`) so the
// browser back button walks the folder stack naturally, and so the
// editor's history-aware back button lands the user back in the folder
// they came from.
//
// Does NOT own data fetching: `<BrowseView>` consumes the explorer
// query hooks (`useFolders`, `useFiles`) directly. Mutations from
// the dialog hooks invalidate those queries, so the view refreshes
// without any manual `refreshTick` plumbing.

import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";

import { PaperSurface } from "@/components/PaperSurface";
import { useMe } from "@/data/auth";
import { useCreateFile, useSetFileTags } from "@/data/files";
import { useFolders, useUpdateFolder } from "@/data/folders";
import { useTags } from "@/data/tags";
import { useMutationWithToast } from "@/data/useMutationWithToast";
import { ExplorerHeader } from "@/features/explorer/ExplorerHeader";
import type { ItemMenuActions } from "@/features/explorer/ItemContextMenu";
import { BrowseView } from "@/features/explorer/views/BrowseView";
import { ShareDialog } from "@/features/sharing/ShareDialog";
import { TagEditDialog } from "@/features/tags/TagEditDialog";
import type { FileKind, FileMeta, FolderMeta } from "@/lib/api/client";

import { FileDeleteDialog } from "./dialogs/FileDeleteDialog";
import { FileMoveDialog } from "./dialogs/FileMoveDialog";
import { FileRenameDialog } from "./dialogs/FileRenameDialog";
import { FolderCreateDialog } from "./dialogs/FolderCreateDialog";
import { FolderDeleteDialog } from "./dialogs/FolderDeleteDialog";
import { FolderMoveDialog } from "./dialogs/FolderMoveDialog";
import { FolderRenameDialog } from "./dialogs/FolderRenameDialog";
import { NewFileDialog } from "./dialogs/NewFileDialog";

type ShareTarget = { kind: "file"; file: FileMeta } | { kind: "folder"; folder: FolderMeta };

export function DashboardPage() {
  const me = useMe();
  const navigate = useNavigate();
  const params = useParams<{ folderId: string }>();
  const folderId = params.folderId ?? null;

  // Legacy `/?folder=<id>` redirect. Old bookmarks land here; rewrite to
  // the canonical path-based URL with `replace` so the legacy form does
  // not clutter the history stack.
  const [legacyParams] = useSearchParams();
  useEffect(() => {
    const legacyFolder = legacyParams.get("folder");
    if (legacyFolder && !folderId) {
      navigate(`/folders/${legacyFolder}`, { replace: true });
    }
  }, [legacyParams, folderId, navigate]);

  const folders = useFolders();
  const tags = useTags();
  const createFile = useCreateFile();
  const setFileTags = useSetFileTags();
  const updateFolder = useUpdateFolder();

  // ─── URL helpers ──────────────────────────────────────────────────
  // Push a new history entry so browser back walks the folder stack.
  function setFolder(id: string | null) {
    navigate(id ? `/folders/${id}` : "/");
  }

  // ─── Dialog state ─────────────────────────────────────────────────
  const [renameFileTarget, setRenameFileTarget] = useState<FileMeta | null>(null);
  const [deleteFileTarget, setDeleteFileTarget] = useState<FileMeta | null>(null);
  const [moveFileTarget, setMoveFileTarget] = useState<FileMeta | null>(null);
  const [tagFileTarget, setTagFileTarget] = useState<FileMeta | null>(null);
  const [shareTarget, setShareTarget] = useState<ShareTarget | null>(null);
  const [folderRenameTarget, setFolderRenameTarget] = useState<FolderMeta | null>(null);
  const [folderMoveTarget, setFolderMoveTarget] = useState<FolderMeta | null>(null);
  const [folderTagsTarget, setFolderTagsTarget] = useState<FolderMeta | null>(null);
  const [folderDeleteTarget, setFolderDeleteTarget] = useState<FolderMeta | null>(null);
  const [folderCreate, setFolderCreate] = useState<{ parentId: string | null } | null>(null);
  // Picker for choosing the kind (excalidraw / drawio / notes) of a
  // new file. Every "New file" entry point — header button,
  // empty-state CTA, and both context-menu variants — opens this
  // picker; only after the user clicks a card does `newFile()`
  // actually run.
  const [newFilePicker, setNewFilePicker] = useState<{ parentId: string | null } | null>(null);

  const runCreateFile = useMutationWithToast(createFile, {
    success: (m) => `Created "${m.name}".`,
    fallback: "failed to create file",
  });
  async function newFile(parentFolderId: string | null, kind: FileKind = "excalidraw") {
    if (createFile.isPending) return;
    const m = await runCreateFile({
      folderId: parentFolderId ?? undefined,
      name: defaultNameForKind(kind),
      kind,
    });
    if (m) navigate(`/f/${m.id}`);
  }

  // ─── Menu actions handed to every view ────────────────────────────
  const tagSuggestions = useMemo(() => (tags.data || []).map((t) => t.name), [tags.data]);
  const actions: ItemMenuActions = {
    openFile: (s) => navigate(`/f/${s.id}`),
    openFolder: (f) => setFolder(f.id),
    shareFile: (s) => setShareTarget({ kind: "file", file: s }),
    shareFolder: (f) => setShareTarget({ kind: "folder", folder: f }),
    editFileTags: (s) => setTagFileTarget(s),
    editFolderTags: (f) => setFolderTagsTarget(f),
    moveFile: (s) => setMoveFileTarget(s),
    moveFolder: (f) => setFolderMoveTarget(f),
    renameFile: (s) => setRenameFileTarget(s),
    renameFolder: (f) => setFolderRenameTarget(f),
    deleteFile: (s) => setDeleteFileTarget(s),
    deleteFolder: (f) => setFolderDeleteTarget(f),
    openNewFilePicker: (parentId) => setNewFilePicker({ parentId }),
    createFolderIn: (parentId) => setFolderCreate({ parentId }),
  };

  if (!me.data) return null;

  const folderList = folders.data ?? null;

  return (
    <PaperSurface variant="page" className="flex h-dvh flex-col">
      <ExplorerHeader user={me.data} />

      <main className="flex flex-1 flex-col min-h-0">
        <BrowseView
          folderId={folderId}
          onChangeFolder={setFolder}
          folders={folderList}
          actions={actions}
        />
      </main>

      {/* ─── File dialogs ─── */}
      <FileRenameDialog
        file={renameFileTarget}
        onOpenChange={(o) => !o && setRenameFileTarget(null)}
      />
      <FileDeleteDialog
        file={deleteFileTarget}
        onOpenChange={(o) => !o && setDeleteFileTarget(null)}
      />
      {folderList ? (
        <FileMoveDialog
          file={moveFileTarget}
          folders={folderList}
          onOpenChange={(o) => !o && setMoveFileTarget(null)}
        />
      ) : null}
      {tagFileTarget ? (
        <TagEditDialog
          open
          onOpenChange={(o) => !o && setTagFileTarget(null)}
          initialTags={tagFileTarget.tags}
          suggestions={tagSuggestions}
          title={`Tags for "${tagFileTarget.name}"`}
          onSave={async (next) =>
            (
              await setFileTags.mutateAsync({
                id: tagFileTarget.id,
                tags: next,
              })
            ).tags
          }
        />
      ) : null}

      {/* ─── Share dialog (file or folder) ─── */}
      {shareTarget ? (
        <ShareDialog
          open
          onOpenChange={(o) => !o && setShareTarget(null)}
          targetType={shareTarget.kind}
          targetId={shareTarget.kind === "file" ? shareTarget.file.id : shareTarget.folder.id}
          targetName={shareTarget.kind === "file" ? shareTarget.file.name : shareTarget.folder.name}
          targetKind={shareTarget.kind === "file" ? shareTarget.file.kind : undefined}
        />
      ) : null}

      {/* ─── New-file picker ─── */}
      <NewFileDialog
        open={!!newFilePicker}
        onOpenChange={(o) => !o && setNewFilePicker(null)}
        onPick={(kind) => {
          // Snapshot the target before clearing state so a StrictMode
          // double-invocation can't read a stale `newFilePicker`.
          const target = newFilePicker;
          setNewFilePicker(null);
          if (target) void newFile(target.parentId, kind);
        }}
      />

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

// Default "Untitled" name for a freshly created file. Kept colocated
// with the create flow so adding a new kind is a one-line change here.
function defaultNameForKind(kind: FileKind): string {
  switch (kind) {
    case "drawio":
      return "Untitled diagram";
    case "notes":
      return "Untitled note";
    case "static-site":
      return "Untitled site";
    default:
      return "Untitled drawing";
  }
}
