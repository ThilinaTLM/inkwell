// Explorer feature — the file-explorer dashboard.
//
// `DashboardPage.tsx` renders the Browse view inside the shared
// `<ExplorerHeader>`. The view shares its per-card right-click context
// menu and the keyboard hotkey contract (`F2` rename, `Delete` delete,
// `Enter` open) via the helpers re-exported here.

export { ExplorerHeader } from "./ExplorerHeader";
export { Breadcrumb } from "./Breadcrumb";
export { ExplorerPageHeader } from "./ExplorerPageHeader";
export { SectionHeading } from "./SectionHeading";
export { BrowseView } from "./views/BrowseView";
export { ItemContextMenu } from "./ItemContextMenu";
export type { ItemContextMenuTarget, ItemMenuActions } from "./ItemContextMenu";
export { useExplorerHotkeys } from "./useExplorerHotkeys";
