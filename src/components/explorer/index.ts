// Explorer view family — the file-explorer dashboard.
//
// `Dashboard.tsx` picks one of three views (Browse / Recent / Search)
// based on `?view=` and renders it inside the shared `<ExplorerHeader>`.
// All three views share the per-card right-click context menu and the
// keyboard hotkey contract (`F2` rename, `Delete` delete, `Enter` open).

export { ExplorerHeader } from "./ExplorerHeader";
export { ViewSwitcher, type ExplorerView } from "./ViewSwitcher";
export { Breadcrumb } from "./Breadcrumb";
export { BrowseView } from "./BrowseView";
export { RecentView } from "./RecentView";
export { SearchView } from "./SearchView";
export { AddTile } from "./AddTile";
export { ItemContextMenu } from "./ItemContextMenu";
export type { ItemContextMenuTarget, ItemMenuActions } from "./ItemContextMenu";
export { useExplorerHotkeys } from "./useExplorerHotkeys";
