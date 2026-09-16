// ItemsSurface — picks the right body for a list view: skeleton while
// loading, empty state when there is nothing to show, otherwise the grid
// or the list depending on the current layout.
//
// Every file view (folder browser, All files, tag view, Home) renders
// through this so loading/empty/grid/list behave identically everywhere.

import type { ReactNode } from "react";

import type { FileMeta, FolderMeta } from "@/lib/api/client";

import type { ItemMenuActions } from "../ItemContextMenu";
import type { ViewLayout } from "../lib/useViewParams";
import { ItemGrid, ItemGridSkeleton, ItemListSkeleton } from "./ItemGrid";
import { ItemList } from "./ItemList";

export function ItemsSurface({
  loading,
  folders,
  files,
  layout,
  actions,
  folderNameOf,
  empty,
}: {
  loading: boolean;
  folders: FolderMeta[];
  files: FileMeta[];
  layout: ViewLayout;
  actions: ItemMenuActions;
  folderNameOf?: (file: FileMeta) => string | null;
  empty: ReactNode;
}) {
  if (loading) return layout === "grid" ? <ItemGridSkeleton /> : <ItemListSkeleton />;
  if (folders.length === 0 && files.length === 0) return <>{empty}</>;
  return layout === "grid" ? (
    <ItemGrid folders={folders} files={files} actions={actions} folderNameOf={folderNameOf} />
  ) : (
    <ItemList folders={folders} files={files} actions={actions} folderNameOf={folderNameOf} />
  );
}
