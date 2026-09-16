// ItemList — the dense table layout for files and folders.
//
// Columns adapt to the surface: the Location column only appears in
// global views (Home, All files, tag views) where items come from
// different folders; the folder browser hides it because everything is
// in the folder you are looking at.
//
// Rows carry the same `data-explorer-item` / `data-explorer-id` contract
// as the grid tiles, so hotkeys and right-click menus work identically
// in both layouts.

import { FolderLibraryIcon, Share08Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import { FileKindGlyph } from "@/components/file-kinds/file-kind-icons";
import type { FileMeta, FolderMeta } from "@/lib/api/client";
import { fileKindInfo } from "@/lib/file-kinds";
import { relTime } from "@/lib/format";
import { cn } from "@/lib/utils";

import { ItemContextMenu, type ItemMenuActions } from "../ItemContextMenu";
import { ItemMenu } from "./ItemMenu";
import { TagChipRow } from "./TagChips";

const ROW =
  "group grid cursor-pointer items-center gap-3 border-b border-border/60 px-3 py-1.5 text-xs transition-colors last:border-b-0 hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset";

export interface ItemListProps {
  folders: FolderMeta[];
  files: FileMeta[];
  actions: ItemMenuActions;
  /** Resolve a file's folder name — enables the Location column. */
  folderNameOf?: (file: FileMeta) => string | null;
}

export function ItemList({ folders, files, actions, folderNameOf }: ItemListProps) {
  const showLocation = !!folderNameOf;
  const cols = showLocation
    ? "grid-cols-[minmax(0,2.2fr)_minmax(0,1fr)_minmax(0,1fr)_5.5rem_1.75rem] sm:grid-cols-[minmax(0,2.5fr)_minmax(0,1fr)_minmax(0,1fr)_6rem_1.75rem]"
    : "grid-cols-[minmax(0,2.5fr)_minmax(0,1fr)_6rem_1.75rem]";

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      {/* Header */}
      <div
        className={cn(
          "grid items-center gap-3 border-b border-border bg-muted/40 px-3 py-1.5 text-[0.6875rem] font-medium uppercase tracking-wide text-muted-foreground",
          cols,
        )}
      >
        <span>Name</span>
        {showLocation ? <span className="hidden sm:block">Location</span> : null}
        <span className="hidden sm:block">Tags</span>
        <span>Updated</span>
        <span className="sr-only">Actions</span>
      </div>

      {folders.map((f) => (
        <ItemContextMenu key={`f:${f.id}`} target={{ kind: "folder", folder: f }} actions={actions}>
          {/* biome-ignore lint/a11y/useSemanticElements: a grid row needs the grid display, <tr> can't provide it here */}
          <div
            role="button"
            tabIndex={0}
            data-explorer-item="folder"
            data-explorer-id={f.id}
            onClick={() => actions.openFolder(f)}
            onKeyDown={(e) => {
              if (e.target !== e.currentTarget) return;
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                actions.openFolder(f);
              }
            }}
            className={cn(ROW, cols)}
          >
            <span className="flex min-w-0 items-center gap-2">
              <HugeiconsIcon
                icon={FolderLibraryIcon}
                strokeWidth={1.6}
                className="size-4 shrink-0 text-muted-foreground"
              />
              <span className="truncate font-medium text-foreground">{f.name}</span>
              {f.activeShareCount > 0 ? (
                <HugeiconsIcon
                  icon={Share08Icon}
                  strokeWidth={2}
                  className="size-3 shrink-0 text-muted-foreground"
                />
              ) : null}
            </span>
            {showLocation ? <span className="hidden sm:block" /> : null}
            <span className="hidden min-w-0 sm:block">
              <TagChipRow tags={f.tags} max={2} />
            </span>
            <span className="truncate text-muted-foreground">
              {f.fileCount + f.subfolderCount} items
            </span>
            <ItemMenu
              target={{ kind: "folder", folder: f }}
              actions={actions}
              className="opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100"
            />
          </div>
        </ItemContextMenu>
      ))}

      {files.map((s) => (
        <ItemContextMenu key={`s:${s.id}`} target={{ kind: "file", file: s }} actions={actions}>
          {/* biome-ignore lint/a11y/useSemanticElements: a grid row needs the grid display, <tr> can't provide it here */}
          <div
            role="button"
            tabIndex={0}
            data-explorer-item="file"
            data-explorer-id={s.id}
            onClick={() => actions.openFile(s)}
            onKeyDown={(e) => {
              if (e.target !== e.currentTarget) return;
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                actions.openFile(s);
              }
            }}
            className={cn(ROW, cols)}
          >
            <span className="flex min-w-0 items-center gap-2">
              <FileKindGlyph kind={s.kind} className="size-4 shrink-0" />
              <span className="truncate font-medium text-foreground">{s.name}</span>
              {s.activeShareCount > 0 ? (
                <HugeiconsIcon
                  icon={Share08Icon}
                  strokeWidth={2}
                  className="size-3 shrink-0 text-muted-foreground"
                />
              ) : null}
            </span>
            {showLocation ? (
              <span className="hidden truncate text-muted-foreground sm:block">
                {folderNameOf(s) ?? "Top level"}
              </span>
            ) : null}
            <span className="hidden min-w-0 sm:block">
              <TagChipRow tags={s.tags} max={2} />
            </span>
            <span className="truncate text-muted-foreground" title={fileKindInfo(s.kind).label}>
              {relTime(s.updatedAt)}
            </span>
            <ItemMenu
              target={{ kind: "file", file: s }}
              actions={actions}
              className="opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100"
            />
          </div>
        </ItemContextMenu>
      ))}
    </div>
  );
}
