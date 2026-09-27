// Dashboard — file-explorer shell.
//
// Owns:
//   - URL state (path: `/` for root, `/folders/:folderId` for a folder).
//   - The `actions` table handed to the Browse view's right-click menu.
//     Dialogs are owned by the shell's DialogHost and every operation
//     goes through `useItemActions` (WS-B); this page is rendered inside
//     the AppShell, which provides the top bar and sidebar.
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

import { useEffect } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";

import { useFolders } from "@/data/folders";
import { useItemActions } from "@/features/actions/useItemActions";
import type { ItemMenuActions } from "@/features/explorer/ItemContextMenu";
import { BrowseView } from "@/features/explorer/views/BrowseView";
import type { ItemRef } from "@/lib/api/client";

export function DashboardPage() {
  const navigate = useNavigate();
  const params = useParams<{ folderId: string }>();
  const folderId = params.folderId ?? null;
  const act = useItemActions();

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

  // Push a new history entry so browser back walks the folder stack.
  function setFolder(id: string | null) {
    navigate(id ? `/folders/${id}` : "/");
  }

  const file = (id: string): ItemRef => ({ type: "file", id });
  const folder = (id: string): ItemRef => ({ type: "folder", id });
  const actions: ItemMenuActions = {
    openFile: (s) => act.open(file(s.id)),
    openFolder: (f) => setFolder(f.id),
    shareFile: (s) => act.share(file(s.id)),
    shareFolder: (f) => act.share(folder(f.id)),
    editFileTags: (s) => act.editTags([file(s.id)]),
    editFolderTags: (f) => act.editTags([folder(f.id)]),
    moveFile: (s) => act.moveDialog([file(s.id)]),
    moveFolder: (f) => act.moveDialog([folder(f.id)]),
    renameFile: (s) => act.renameDialog(file(s.id)),
    renameFolder: (f) => act.renameDialog(folder(f.id)),
    deleteFile: (s) => void act.trash([file(s.id)]),
    deleteFolder: (f) => void act.trash([folder(f.id)]),
    openNewFilePicker: (parentId) => void act.newFile(parentId),
    createFolderIn: (parentId) => act.newFolder(parentId),
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <BrowseView
        folderId={folderId}
        onChangeFolder={setFolder}
        folders={folders.data ?? null}
        actions={actions}
      />
    </div>
  );
}
