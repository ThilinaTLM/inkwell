// BrowseSplitLayout — sidebar folder tree + content body. Used by
// `<BrowseView>` when `layout === "tree"`.
//
// The sidebar reuses `<FolderTree>` (originally built for the move-to
// dialog) so we don't duplicate disclosure / selection logic. Below
// `md` the sidebar is hidden — phone-sized viewports stay grid-only.

import type { FolderMeta } from "@/lib/api/client";
import { FolderTree } from "@/features/folders/FolderTree";

interface BrowseSplitLayoutProps {
  folders: FolderMeta[];
  /** Current folder id, or `null` for the root. */
  activeId: string | null;
  onSelect: (id: string | null) => void;
  /** The grid body that renders the selected folder's children. */
  children: React.ReactNode;
}

export function BrowseSplitLayout({
  folders,
  activeId,
  onSelect,
  children,
}: BrowseSplitLayoutProps) {
  return (
    <div className="flex flex-1 min-h-0">
      <aside
        aria-label="Folder tree"
        className="hidden w-64 shrink-0 overflow-y-auto border-r border-ink-soft/15 px-3 py-3 md:block"
      >
        <FolderTree
          folders={folders}
          selectedId={activeId}
          onSelect={onSelect}
          rootLabel="Home"
        />
      </aside>
      <div className="flex flex-1 min-w-0 flex-col min-h-0">
        {children}
      </div>
    </div>
  );
}
