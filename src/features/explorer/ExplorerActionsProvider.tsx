// ExplorerActionsProvider — owns every file/folder mutation dialog and
// exposes the shared `ItemMenuActions` table through context.
//
// Previously all of this lived inside `DashboardPage`, which meant only
// the folder browser could rename/move/share/delete. Now that the app
// has several file surfaces (Home, All files, Tags, a folder browser)
// plus a shell-level "New" button and a command palette, the dialogs
// are hoisted into the app shell and every surface calls the same
// actions via `useItemActions()`.
//
// The provider derives the "current folder" from the URL (`/folders/:id`)
// so shell-level entry points ("New file" in the top bar, ⌘K actions)
// create into whatever folder the user is looking at.

import { createContext, type ReactNode, useContext, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { useCreateFile, useSetFileTags } from "@/data/files";
import { useFolders, useUpdateFolder } from "@/data/folders";
import { useTags } from "@/data/tags";
import { useMutationWithToast } from "@/data/useMutationWithToast";
import { ShareDialog } from "@/features/sharing/ShareDialog";
import { TagEditDialog } from "@/features/tags/TagEditDialog";
import type { FileKind, FileMeta, FolderMeta } from "@/lib/api/client";
import { fileKindInfo } from "@/lib/file-kinds";

import { FileDeleteDialog } from "./dialogs/FileDeleteDialog";
import { FileMoveDialog } from "./dialogs/FileMoveDialog";
import { FileRenameDialog } from "./dialogs/FileRenameDialog";
import { FolderCreateDialog } from "./dialogs/FolderCreateDialog";
import { FolderDeleteDialog } from "./dialogs/FolderDeleteDialog";
import { FolderMoveDialog } from "./dialogs/FolderMoveDialog";
import { FolderRenameDialog } from "./dialogs/FolderRenameDialog";
import { NewFileDialog } from "./dialogs/NewFileDialog";
import type { ItemMenuActions } from "./ItemContextMenu";

type ShareTarget = { kind: "file"; file: FileMeta } | { kind: "folder"; folder: FolderMeta };

interface ExplorerActionsValue extends ItemMenuActions {
  /** Folder the user is currently browsing (`null` at root / non-folder views). */
  currentFolderId: string | null;
  /** Create a file of `kind` directly, skipping the picker. */
  createFile: (kind: FileKind, parentFolderId?: string | null) => void;
}

const Ctx = createContext<ExplorerActionsValue | null>(null);

/** Folder id from `/folders/:id`, or null anywhere else. */
function folderIdFromPath(pathname: string): string | null {
  const m = /^\/folders\/([^/]+)/.exec(pathname);
  return m ? decodeURIComponent(m[1]) : null;
}

export function ExplorerActionsProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const currentFolderId = folderIdFromPath(location.pathname);

  const folders = useFolders();
  const tags = useTags();
  const createFileMutation = useCreateFile();
  const setFileTags = useSetFileTags();
  const updateFolder = useUpdateFolder();

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
  const [newFilePicker, setNewFilePicker] = useState<{ parentId: string | null } | null>(null);

  const runCreateFile = useMutationWithToast(createFileMutation, {
    success: (m) => `Created "${m.name}".`,
    fallback: "failed to create file",
  });

  const folderList = folders.data ?? null;
  const tagSuggestions = useMemo(() => (tags.data || []).map((t) => t.name), [tags.data]);

  async function newFile(parentFolderId: string | null, kind: FileKind) {
    if (createFileMutation.isPending) return;
    const m = await runCreateFile({
      folderId: parentFolderId ?? undefined,
      name: fileKindInfo(kind).defaultName,
      kind,
    });
    if (m) navigate(`/f/${m.id}`);
  }

  const value: ExplorerActionsValue = {
    currentFolderId,
    openFile: (s) => navigate(`/f/${s.id}`),
    openFolder: (f) => navigate(`/folders/${f.id}`),
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
    createFile: (kind, parentFolderId) =>
      void newFile(parentFolderId === undefined ? currentFolderId : parentFolderId, kind),
  };

  return (
    <Ctx.Provider value={value}>
      {children}

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
            (await setFileTags.mutateAsync({ id: tagFileTarget.id, tags: next })).tags
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
            (await updateFolder.mutateAsync({ id: folderTagsTarget.id, patch: { tags: next } }))
              .tags
          }
        />
      ) : null}
      <FolderDeleteDialog
        folder={folderDeleteTarget}
        onOpenChange={(o) => !o && setFolderDeleteTarget(null)}
        onDeleted={(deleted) => {
          // If the user was viewing the deleted folder (or a child of it),
          // pop up to the root since the URL now points at nothing.
          if (currentFolderId === deleted.id) {
            navigate("/folders");
            return;
          }
          const wasDescendant =
            !!currentFolderId &&
            folderList?.some((f) => f.id === currentFolderId && f.parentId === deleted.id);
          if (wasDescendant) navigate("/folders");
        }}
      />
    </Ctx.Provider>
  );
}

/** The shared file/folder action table. Must be used inside `<AppShell>`. */
export function useItemActions(): ExplorerActionsValue {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useItemActions must be used inside <ExplorerActionsProvider>");
  return ctx;
}
