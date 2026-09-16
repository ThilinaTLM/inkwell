// DashboardPage — the folder browser.
//
//   /folders                → root (folders + files with `folder_id IS NULL`)
//   /folders/:folderId      → that folder's direct children
//
// The page is now thin: the app shell owns navigation chrome, the
// `<ExplorerActionsProvider>` owns every dialog and the shared action
// table, and `useViewParams` owns sort/filter/layout state. What is left
// here is the folder-scoped query plus the header, toolbar and hotkeys.
//
// Legacy `/?folder=<id>` URLs are redirected by `HomePage`.

import { FolderAddIcon, FolderLibraryIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useMemo, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { EmptyState } from "@/components/EmptyState";
import { AppShell } from "@/components/layout/AppShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { useFiles } from "@/data/files";
import { useFolders } from "@/data/folders";
import { folderPath } from "@/features/folders/FolderTree";

import { Breadcrumb } from "./Breadcrumb";
import { useItemActions } from "./ExplorerActionsProvider";
import { ItemsSurface } from "./items/ItemsSurface";
import { filterFiles, filterFolders, sortFiles, sortFolders } from "./lib/sortFiles";
import { useViewParams } from "./lib/useViewParams";
import { useExplorerHotkeys } from "./useExplorerHotkeys";
import { ViewToolbar } from "./ViewToolbar";

export function DashboardPage() {
  return (
    <AppShell>
      <BrowseView />
    </AppShell>
  );
}

function BrowseView() {
  const params = useParams<{ folderId: string }>();
  const folderId = params.folderId ?? null;
  const navigate = useNavigate();
  const actions = useItemActions();
  const view = useViewParams({ layout: "grid", sort: "updated" });

  const foldersQuery = useFolders();
  const filesQuery = useFiles({ folderId: folderId ?? "root" });
  const folders = foldersQuery.data ?? null;
  const files = filesQuery.data ?? null;
  const loading = folders === null || files === null;

  const subfolders = useMemo(() => {
    if (!folders) return [];
    return sortFolders(
      filterFolders(
        folders.filter((f) => (f.parentId ?? null) === folderId),
        { q: view.q },
      ),
      view.sort,
    );
  }, [folders, folderId, view.q, view.sort]);

  const visibleFiles = useMemo(() => {
    if (!files) return [];
    return sortFiles(filterFiles(files, { q: view.q, kind: view.kind }), view.sort);
  }, [files, view.q, view.kind, view.sort]);

  const breadcrumb = useMemo(
    () => (folders && folderId ? folderPath(folders, folderId) : []),
    [folders, folderId],
  );

  const containerRef = useRef<HTMLDivElement | null>(null);
  useExplorerHotkeys(containerRef, {
    onRename: (item) => {
      if (item.kind === "file") {
        const s = files?.find((x) => x.id === item.id);
        if (s) actions.renameFile(s);
      } else {
        const f = folders?.find((x) => x.id === item.id);
        if (f) actions.renameFolder(f);
      }
    },
    onDelete: (item) => {
      if (item.kind === "file") {
        const s = files?.find((x) => x.id === item.id);
        if (s) actions.deleteFile(s);
      } else {
        const f = folders?.find((x) => x.id === item.id);
        if (f) actions.deleteFolder(f);
      }
    },
    onOpen: (item) => {
      if (item.kind === "file") {
        const s = files?.find((x) => x.id === item.id);
        if (s) actions.openFile(s);
      } else {
        const f = folders?.find((x) => x.id === item.id);
        if (f) actions.openFolder(f);
      }
    },
  });

  const current = breadcrumb.length ? breadcrumb[breadcrumb.length - 1] : null;

  return (
    <div ref={containerRef} className="flex flex-col gap-4 py-4" tabIndex={-1}>
      <PageHeader
        title={current ? current.name : "Folders"}
        above={
          breadcrumb.length > 0 ? (
            <Breadcrumb
              path={breadcrumb}
              onJump={(id) => navigate(id ? `/folders/${id}` : "/folders")}
              variant="compact"
            />
          ) : null
        }
        description={loading ? undefined : summarise(subfolders.length, visibleFiles.length)}
      />

      <ViewToolbar
        view={view}
        count={null}
        actions={
          <Button variant="outline" size="sm" onClick={() => actions.createFolderIn(folderId)}>
            <HugeiconsIcon icon={FolderAddIcon} strokeWidth={1.8} />
            <span className="hidden sm:inline">New folder</span>
          </Button>
        }
      />

      <ItemsSurface
        loading={loading}
        folders={subfolders}
        files={visibleFiles}
        layout={view.layout}
        actions={actions}
        empty={
          view.filtered ? (
            <EmptyState
              icon={FolderLibraryIcon}
              title="Nothing matches those filters"
              description="Try a different search term or clear the type filter."
              actions={
                <Button variant="outline" size="sm" onClick={view.clearFilters}>
                  Clear filters
                </Button>
              }
            />
          ) : (
            <EmptyState
              icon={FolderLibraryIcon}
              title={current ? `“${current.name}” is empty` : "No files yet"}
              description="Create a file or a subfolder to get started."
              actions={
                <>
                  <Button size="sm" onClick={() => actions.openNewFilePicker(folderId)}>
                    New file
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => actions.createFolderIn(folderId)}
                  >
                    New folder
                  </Button>
                </>
              }
            />
          )
        }
      />
    </div>
  );
}

function summarise(folders: number, files: number): string {
  const f = `${folders} folder${folders === 1 ? "" : "s"}`;
  const s = `${files} file${files === 1 ? "" : "s"}`;
  return `${f} · ${s}`;
}
