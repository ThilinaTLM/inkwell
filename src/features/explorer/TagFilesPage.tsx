// TagFilesPage — every file carrying one tag (`/tags/:tag`).
//
// Tag filtering is done server-side (`GET /api/files?tag=…`), so this is
// its own query rather than a slice of the all-files cache; the rest of
// the surface (toolbar, layout, empty states) is shared with the other
// file views.

import { HashtagIcon } from "@hugeicons/core-free-icons";
import { useMemo, useRef } from "react";
import { Link, useParams } from "react-router-dom";

import { EmptyState } from "@/components/EmptyState";
import { AppShell } from "@/components/layout/AppShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { useFiles } from "@/data/files";
import { useFolders } from "@/data/folders";

import { useItemActions } from "./ExplorerActionsProvider";
import { ItemsSurface } from "./items/ItemsSurface";
import { filterFiles, folderNameMap, sortFiles } from "./lib/sortFiles";
import { useViewParams } from "./lib/useViewParams";
import { useExplorerHotkeys } from "./useExplorerHotkeys";
import { ViewToolbar } from "./ViewToolbar";

export function TagFilesPage() {
  return (
    <AppShell>
      <TagView />
    </AppShell>
  );
}

function TagView() {
  const params = useParams<{ tag: string }>();
  const tag = params.tag ? decodeURIComponent(params.tag) : "";
  const actions = useItemActions();
  const view = useViewParams({ layout: "list", sort: "updated" });

  const filesQuery = useFiles({ tags: [tag] });
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

  return (
    <div ref={containerRef} className="flex flex-col gap-4 py-4" tabIndex={-1}>
      <PageHeader
        title={`#${tag}`}
        description={all ? `${all.length} file${all.length === 1 ? "" : "s"} tagged` : undefined}
      />

      <ViewToolbar view={view} count={all ? <span>{files.length} shown</span> : null} />

      <ItemsSurface
        loading={all === null}
        folders={[]}
        files={files}
        layout={view.layout}
        actions={actions}
        folderNameOf={(f) => (f.folderId ? (names.get(f.folderId) ?? null) : null)}
        empty={
          <EmptyState
            icon={HashtagIcon}
            title={`Nothing tagged “${tag}”`}
            description="Tags you add to files and folders show up in the sidebar."
            actions={
              <Button variant="outline" size="sm" render={<Link to="/files" />}>
                Browse all files
              </Button>
            }
          />
        }
      />
    </div>
  );
}
