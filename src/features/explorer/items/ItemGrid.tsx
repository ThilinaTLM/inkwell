// ItemGrid — the tile layout for files and folders.
//
// Folders are rendered first in their own compact auto-fill row, then
// files in a wider auto-fill grid; one declaration per band scales from
// phone to ultrawide without breakpoint guessing.

import type { FileMeta, FolderMeta } from "@/lib/api/client";

import { ItemContextMenu, type ItemMenuActions } from "../ItemContextMenu";
import { FileGridCard } from "./FileGridCard";
import { FolderGridCard } from "./FolderGridCard";

const FOLDER_GRID = "grid gap-2 [grid-template-columns:repeat(auto-fill,minmax(180px,1fr))]";
const FILE_GRID = "grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(168px,1fr))]";

export function ItemGrid({
  folders,
  files,
  actions,
  folderNameOf,
}: {
  folders: FolderMeta[];
  files: FileMeta[];
  actions: ItemMenuActions;
  folderNameOf?: (file: FileMeta) => string | null;
}) {
  return (
    <div className="flex flex-col gap-4">
      {folders.length > 0 ? (
        <div className={FOLDER_GRID}>
          {folders.map((f) => (
            <ItemContextMenu
              key={`f:${f.id}`}
              target={{ kind: "folder", folder: f }}
              actions={actions}
            >
              <FolderGridCard folder={f} actions={actions} />
            </ItemContextMenu>
          ))}
        </div>
      ) : null}

      {files.length > 0 ? (
        <div className={FILE_GRID}>
          {files.map((s) => (
            <ItemContextMenu key={`s:${s.id}`} target={{ kind: "file", file: s }} actions={actions}>
              <FileGridCard
                file={s}
                actions={actions}
                folderName={folderNameOf ? folderNameOf(s) : null}
              />
            </ItemContextMenu>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** Loading placeholder matching the grid geometry. */
export function ItemGridSkeleton({ count = 10 }: { count?: number }) {
  return (
    <div className={FILE_GRID}>
      {Array.from({ length: count }, (_, i) => (
        <div
          // biome-ignore lint/suspicious/noArrayIndexKey: static placeholder list
          key={i}
          className="overflow-hidden rounded-lg border border-border bg-card"
        >
          <div className="aspect-[16/10] w-full animate-pulse bg-muted" />
          <div className="flex flex-col gap-1.5 px-2.5 py-2">
            <div className="h-2.5 w-3/4 animate-pulse rounded bg-muted" />
            <div className="h-2 w-1/2 animate-pulse rounded bg-muted" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Loading placeholder matching the list geometry. */
export function ItemListSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      {Array.from({ length: count }, (_, i) => (
        <div
          // biome-ignore lint/suspicious/noArrayIndexKey: static placeholder list
          key={i}
          className="flex items-center gap-3 border-b border-border/60 px-3 py-2.5 last:border-b-0"
        >
          <div className="size-4 animate-pulse rounded bg-muted" />
          <div className="h-2.5 w-1/3 animate-pulse rounded bg-muted" />
          <div className="ml-auto h-2.5 w-16 animate-pulse rounded bg-muted" />
        </div>
      ))}
    </div>
  );
}
