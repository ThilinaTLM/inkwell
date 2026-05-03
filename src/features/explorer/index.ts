// Explorer feature — the file-explorer dashboard.
//
// `DashboardPage.tsx` renders the Browse view inside the shared
// `<ExplorerHeader>`. The view shares its per-card right-click context
// menu and the keyboard hotkey contract (`F2` rename, `Delete` delete,
// `Enter` open) via the helpers re-exported here.

export { Breadcrumb } from "./Breadcrumb";
export { ExplorerHeader } from "./ExplorerHeader";
export { ExplorerPageHeader } from "./ExplorerPageHeader";
export type { ItemContextMenuTarget, ItemMenuActions } from "./ItemContextMenu";
export { ItemContextMenu } from "./ItemContextMenu";
export { SectionHeading } from "./SectionHeading";
export { useExplorerHotkeys } from "./useExplorerHotkeys";
export { BrowseView } from "./views/BrowseView";
