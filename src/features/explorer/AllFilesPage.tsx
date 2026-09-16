// AllFilesPage — every file the account owns, in one flat list.
//
// This is the search/triage surface: no folder scoping, a Location
// column so you can still see where something lives, and the full
// toolbar (search term from the top bar, type filter, sort, layout).
//
// The underlying query is the shared `useAllFiles` cache, so arriving
// here from Home or the command palette is instant.

import { File01Icon } from "@hugeicons/core-free-icons";
import { useMemo, useRef } from "react";

import { EmptyState } from "@/components/EmptyState";
import { AppShell } from "@/components/layout/AppShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { useAllFiles } from "@/data/files";
import { useFolders } from "@/data/folders";

import { useItemActions } from "./ExplorerActionsProvider";
import { ItemsSurface } from "./items/ItemsSurface";
import { FILE_LIST_CAP, filterFiles, folderNameMap, sortFiles } from "./lib/sortFiles";
import { useViewParams } from "./lib/useViewParams";
import { useExplorerHotkeys } from "./useExplorerHotkeys";
import { ViewToolbar } from "./ViewToolbar";

export function AllFilesPage() {
  return (
    <AppShell>
      <AllFilesView />
    </AppShell>
  );
}

function AllFilesView() {
  const actions = useItemActions();
  const view = useViewParams({ layout: "list", sort: "updated" });
  const filesQuery = useAllFiles();
  const foldersQuery = useFolders();

  const all = filesQuery.data ?? null;
  const names = useMemo(() => folderNameMap(foldersQuery.data), [foldersQuery.data]);

  const files = useMemo(() => {
    if (!all) return [];
    return sortFiles(filterFiles(all, { q: view.q, kind: view.kind }), view.sort);
  }, [all, view.q, view.kind, view.sort]);

  const containerRef = useRef<HTMLDivElement | null>(null);
  useExplorerHotkeys(containerRef, {
    onRename: (item) => {
      const s = all?.find((x) => x.id === item.id);
      if (s) actions.renameFile(s);
    },
    onDelete: (item) => {
      const s = all?.find((x) => x.id === item.id);
      if (s) actions.deleteFile(s);
    },
    onOpen: (item) => {
      const s = all?.find((x) => x.id === item.id);
      if (s) actions.openFile(s);
    },
  });

  const capped = (all?.length ?? 0) >= FILE_LIST_CAP;

  return (
    <div ref={containerRef} className="flex flex-col gap-4 py-4" tabIndex={-1}>
      <PageHeader
        title="All files"
        description={
          capped
            ? `Showing the ${FILE_LIST_CAP} most recently updated files.`
            : all
              ? `${all.length} file${all.length === 1 ? "" : "s"}`
              : undefined
        }
      />

      <ViewToolbar
        view={view}
        count={
          all ? (
            <span>
              {files.length} of {all.length}
            </span>
          ) : null
        }
      />

      <ItemsSurface
        loading={all === null}
        folders={[]}
        files={files}
        layout={view.layout}
        actions={actions}
        folderNameOf={(f) => (f.folderId ? (names.get(f.folderId) ?? null) : null)}
        empty={
          view.filtered ? (
            <EmptyState
              icon={File01Icon}
              title="No matching files"
              description="Try a different search term or clear the type filter."
              actions={
                <Button variant="outline" size="sm" onClick={view.clearFilters}>
                  Clear filters
                </Button>
              }
            />
          ) : (
            <EmptyState
              icon={File01Icon}
              title="No files yet"
              description="Use the New button in the top bar to create your first file."
            />
          )
        }
      />
    </div>
  );
}
