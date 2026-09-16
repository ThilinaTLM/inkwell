// FolderGridCard — a folder tile in the grid layout.
//
// Deliberately flatter than a file tile: folders are navigation, not
// content, so they get a single compact row (icon, name, item count)
// rather than a preview band. That also makes mixed grids read
// correctly — folders form a short band above the taller file tiles.

import { FolderLibraryIcon, Share08Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import type { FolderMeta } from "@/lib/api/client";
import { cn } from "@/lib/utils";

import type { ItemMenuActions } from "../ItemContextMenu";
import { ItemMenu } from "./ItemMenu";

export function FolderGridCard({
  folder,
  actions,
}: {
  folder: FolderMeta;
  actions: ItemMenuActions;
}) {
  const count = folder.fileCount + folder.subfolderCount;
  return (
    // biome-ignore lint/a11y/useSemanticElements: a button element cannot contain the nested overflow-menu trigger this tile needs
    <div
      role="button"
      aria-label={folder.name}
      data-explorer-item="folder"
      data-explorer-id={folder.id}
      tabIndex={0}
      onClick={() => actions.openFolder(folder)}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          actions.openFolder(folder);
        }
      }}
      title={folder.name}
      className={cn(
        "group relative flex cursor-pointer items-center gap-2 rounded-lg border border-border bg-card px-2.5 py-2 transition-colors",
        "hover:border-ring/40 hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
      )}
    >
      <HugeiconsIcon
        icon={FolderLibraryIcon}
        strokeWidth={1.6}
        className="size-5 shrink-0 text-muted-foreground"
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-xs font-medium text-foreground">{folder.name}</span>
        <span className="text-[0.6875rem] text-muted-foreground">
          {count === 0 ? "Empty" : `${count} item${count === 1 ? "" : "s"}`}
        </span>
      </div>
      {folder.activeShareCount > 0 ? (
        <HugeiconsIcon
          icon={Share08Icon}
          strokeWidth={2}
          className="size-3 shrink-0 text-muted-foreground"
        />
      ) : null}
      <ItemMenu
        target={{ kind: "folder", folder }}
        actions={actions}
        className="opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100"
      />
    </div>
  );
}
