// RootFolderTabStrip — the row of root-level folder tabs that sits at the
// top of the dashboard, just below the DeskHeader. The Inbox always comes
// first (with a graphite accent), followed by user-created root folders
// in name order, and a final "+" tab for creating a new root folder.
//
// "All scenes" is exposed as the leftmost tab so the user can return to
// the unscoped view from anywhere.

import { HugeiconsIcon } from "@hugeicons/react";
import { Files01Icon, FolderAddIcon } from "@hugeicons/core-free-icons";
import { cn } from "@/lib/utils";
import { RoughBox } from "@/components/rough";
import { FolderTab } from "./FolderTab";
import type { FolderMeta } from "@/api";

interface RootFolderTabStripProps {
  folders: FolderMeta[] | null;
  /** Active folder id; null when the user is on "All scenes". */
  activeId: string | null;
  /** True when scope.kind === "all". */
  allActive: boolean;
  onSelectAll: () => void;
  onSelectFolder: (id: string) => void;
  onCreateRootFolder: () => void;
}

export function RootFolderTabStrip({
  folders,
  activeId,
  allActive,
  onSelectAll,
  onSelectFolder,
  onCreateRootFolder,
}: RootFolderTabStripProps) {
  const roots = (folders ?? []).filter((f) => f.parentId === null);
  // Inbox first, then alphabetical user folders.
  const sortedRoots = [
    ...roots.filter((f) => f.isDefault),
    ...roots
      .filter((f) => !f.isDefault)
      .sort((a, b) => a.name.localeCompare(b.name)),
  ];

  return (
    <nav
      aria-label="Root folders"
      className="relative -mb-px flex items-end gap-2 overflow-x-auto px-6 pt-2 pb-1 [scrollbar-width:thin]"
    >
      {/* "All scenes" pseudo-tab — chalk-outline silhouette so it reads as
          a meta scope rather than a real folder. */}
      <button
        type="button"
        onClick={onSelectAll}
        aria-pressed={allActive}
        className={cn(
          "group relative inline-flex h-12 min-w-32 items-center gap-1.5 px-3.5 font-heading text-sm transition-all duration-200",
          allActive
            ? "z-10 -translate-y-0.5 text-ink"
            : "text-ink-soft hover:-translate-y-1 hover:text-ink"
        )}
      >
        <RoughBox
          shape="folder-tab"
          seed="all-scenes"
          stroke="var(--color-ink-soft)"
          strokeWidth={1.4}
          fill={allActive ? "var(--color-paper-elev)" : "transparent"}
          fillStyle="solid"
          roughness={1.2}
          tabHeight={14}
          tabWidth={0.42}
          tabSlope={7}
        />
        <span className="relative z-10 flex items-center gap-1.5 pt-2">
          <HugeiconsIcon
            icon={Files01Icon}
            strokeWidth={1.6}
            className="size-3.5"
          />
          All scenes
        </span>
      </button>

      {folders === null && (
        // Skeleton while loading
        <>
          <div className="h-12 w-32 rounded-md bg-paper-edge/50 animate-pulse" />
          <div className="h-12 w-36 rounded-md bg-paper-edge/40 animate-pulse" />
          <div className="h-12 w-32 rounded-md bg-paper-edge/30 animate-pulse" />
        </>
      )}

      {sortedRoots.map((f) => (
        <FolderTab
          key={f.id}
          id={f.id}
          name={f.name}
          accent={f.isDefault ? "graphite" : "manila"}
          isInbox={f.isDefault}
          variant="strip"
          active={activeId === f.id}
          onClick={() => onSelectFolder(f.id)}
        />
      ))}

      {folders !== null && (
        <button
          type="button"
          onClick={onCreateRootFolder}
          aria-label="New folder"
          className="group relative inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-md text-ink-soft transition-colors hover:text-vermillion focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
        >
          <RoughBox
            shape="rect"
            seed="new-folder-add"
            stroke="var(--color-ink-soft)"
            strokeWidth={1.2}
            fill="transparent"
            roughness={1.6}
            bowing={2.5}
          />
          <HugeiconsIcon
            icon={FolderAddIcon}
            strokeWidth={1.8}
            className="relative size-5"
          />
        </button>
      )}
    </nav>
  );
}
