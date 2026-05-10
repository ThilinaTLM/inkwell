// BrowseView — the file-explorer pane.
//
//   /                       → root (folders + files with `folder_id IS NULL`)
//   /folders/:folderId      → that folder's direct children
//
// Layout:
//   - A single rounded "deck" panel that owns three flex children:
//       1. Header row: heading-variant breadcrumb (acts as the title)
//          plus "New folder" outline button and `<NewFileButton>`
//          (opens the `<NewFileDialog>` picker).
//       2. Scrollable body: responsive grid (folders first, then
//          files), the loading skeleton, or the centered empty state.
//       3. Footer status bar showing "X folders · Y files".
//     The whole panel is the empty-area `<ItemContextMenu>` target so
//     right-click anywhere creates new.
//   - The grid body is the route's vertical scroll container; the
//     panel header and footer stay pinned, as does the global
//     `<ExplorerHeader>` (DashboardPage uses `h-dvh`).

import { FolderAddIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { SkeletonGrid } from "@/components/SkeletonGrid";
import { EmptyDeskNote } from "@/components/sketch/EmptyDeskNote";
import { FileCard } from "@/components/sketch/FileCard";
import { FolderCard } from "@/components/sketch/FolderCard";
import { Button } from "@/components/ui/button";
import { useFiles } from "@/data/files";
import { folderPath } from "@/features/folders/FolderTree";
import type { FolderMeta } from "@/lib/api/client";
import { relTime } from "@/lib/format";

import { Breadcrumb } from "../Breadcrumb";
import { ItemContextMenu, type ItemMenuActions } from "../ItemContextMenu";
import { NewFileButton } from "../NewFileButton";
import { useExplorerHotkeys } from "../useExplorerHotkeys";

interface BrowseViewProps {
  /** Currently open folder, or `null` to browse the root. */
  folderId: string | null;
  onChangeFolder: (id: string | null) => void;
  /** Pre-loaded folder list (whole tree) from the dashboard. */
  folders: FolderMeta[] | null;
  actions: ItemMenuActions;
}

// Auto-fill grid: each tile clamps to a min width and the row fills as
// many columns as the viewport allows. One declaration scales fluidly
// from phone to ultrawide — simpler than guessing six breakpoints.
const GRID_CLASSES = "grid gap-3 px-6 [grid-template-columns:repeat(auto-fill,minmax(140px,1fr))]";

export function BrowseView({ folderId, onChangeFolder, folders, actions }: BrowseViewProps) {
  const filesQuery = useFiles({ folderId: folderId ?? "root" });
  const navigate = useNavigate();
  const files = filesQuery.data ?? null;

  const subfolders = useMemo(() => {
    if (!folders) return [];
    return folders
      .filter((f) => (f.parentId ?? null) === folderId)
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
  }, [folders, folderId]);

  const breadcrumb = useMemo(() => {
    if (!folders || !folderId) return [];
    return folderPath(folders, folderId);
  }, [folders, folderId]);

  const containerRef = useRef<HTMLDivElement | null>(null);
  useExplorerHotkeys(containerRef, {
    onRename: (item) => {
      if (item.kind === "file") {
        const s = files?.find((x) => x.id === item.id);
        if (s) actions.renameFile(s);
      } else {
        const f = folders?.find((x) => x.id === item.id);
        if (f) actions.renameFolder(f);
      }
    },
    onDelete: (item) => {
      if (item.kind === "file") {
        const s = files?.find((x) => x.id === item.id);
        if (s) actions.deleteFile(s);
      } else {
        const f = folders?.find((x) => x.id === item.id);
        if (f) actions.deleteFolder(f);
      }
    },
    onOpen: (item) => {
      if (item.kind === "file") {
        const s = files?.find((x) => x.id === item.id);
        if (s) actions.openFile(s);
      } else {
        const f = folders?.find((x) => x.id === item.id);
        if (f) onChangeFolder(f.id);
      }
    },
  });

  const isLoading = files === null || folders === null;
  const isEmpty = !isLoading && subfolders.length === 0 && (files?.length ?? 0) === 0;

  // Heading-variant breadcrumb doubles as the page title: at root it
  // renders just "Home"; inside a folder it renders "Home › Parent ›
  // Current" at title size, with ancestors clickable. This avoids the
  // duplicate "breadcrumb on top, folder name below" stutter.
  const titleNode = <Breadcrumb path={breadcrumb} onJump={onChangeFolder} variant="heading" />;
  // Item-count text is rendered as a footer status bar inside the
  // deck panel (see below) rather than as a page-header subtitle:
  // it describes the panel contents, not the page.
  const statusText = isLoading ? null : buildSubtitle(subfolders.length, files?.length ?? 0);

  // The view sits on a subtly lifted "deck" surface — `bg-muted/40`
  // tints just enough above `--background` to separate the working
  // area from the global header chrome, in both light and dark themes.
  // Inset on all four sides with a hairline border + rounded corners
  // so the panel reads as a self-contained tray rather than a wall.
  // The panel owns three rows: header (breadcrumb + actions),
  // scrollable body (grid / skeleton / empty), and footer status bar.
  return (
    <div ref={containerRef} className="flex flex-1 flex-col min-h-0" tabIndex={-1}>
      <ItemContextMenu
        target={{ kind: "empty", folderId }}
        actions={actions}
        className="flex flex-1 flex-col min-h-0"
      >
        <div className="mx-3 mt-3 mb-3 flex flex-1 flex-col min-h-0 overflow-hidden rounded-2xl border border-border/50 bg-muted/40">
          {/* In-panel header — title + actions. Bottom border mirrors
           *  the footer's top border so both rows read as panel chrome
           *  framing the scrolling grid body. */}
          <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border/40 px-4 py-3 sm:gap-3 sm:px-6">
            <div className="min-w-0 flex-1">{titleNode}</div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                aria-label="New folder"
                onClick={() => actions.createFolderIn(folderId)}
              >
                <HugeiconsIcon icon={FolderAddIcon} strokeWidth={1.7} />
                <span className="hidden sm:inline">New folder</span>
              </Button>
              <NewFileButton
                onClick={() => actions.openNewFilePicker(folderId)}
                collapseLabelOnMobile
              />
            </div>
          </header>

          {/* Scrollable body — the route's vertical scroll container.
           *  `min-h-0` lets the flex parent clamp its height so this
           *  div actually scrolls instead of pushing the panel. */}
          <div className="flex flex-1 flex-col min-h-0 overflow-y-auto py-4">
            {isLoading ? (
              <div className="px-6">
                <SkeletonGrid />
              </div>
            ) : isEmpty ? (
              <CenteredEmpty
                folderName={breadcrumb.length ? breadcrumb[breadcrumb.length - 1].name : null}
                onCreate={() => actions.openNewFilePicker(folderId)}
                onCreateFolder={() => actions.createFolderIn(folderId)}
              />
            ) : (
              // Single grid: folders first, then files. Folder/file
              // keys are prefixed so a folder and a file with the
              // same uuid can never collide in React's reconciler.
              <div className={GRID_CLASSES}>
                {subfolders.map((f) => (
                  <ItemContextMenu
                    key={`f:${f.id}`}
                    target={{ kind: "folder", folder: f }}
                    actions={actions}
                  >
                    <FolderCard
                      id={f.id}
                      name={f.name}
                      itemCount={f.fileCount + f.subfolderCount}
                      previews={f.previews}
                      activeShareCount={f.activeShareCount}
                      onOpenShare={() => actions.shareFolder(f)}
                      onOpen={() => onChangeFolder(f.id)}
                    />
                  </ItemContextMenu>
                ))}
                {files?.map((s) => (
                  <ItemContextMenu
                    key={`s:${s.id}`}
                    target={{ kind: "file", file: s }}
                    actions={actions}
                  >
                    <FileCard
                      id={s.id}
                      name={s.name}
                      kind={s.kind}
                      hasThumb={s.hasThumb}
                      thumbUrl={`/api/files/${s.id}/thumb?v=${s.thumbUpdatedAt}`}
                      folderName={null}
                      updatedAtLabel={relTime(s.updatedAt)}
                      tags={s.tags}
                      activeShareCount={s.activeShareCount}
                      onOpenShare={() => actions.shareFile(s)}
                      onOpen={() => navigate(`/f/${s.id}`)}
                    />
                  </ItemContextMenu>
                ))}
              </div>
            )}
          </div>

          {/* Footer status bar — quiet panel chrome that mirrors the
           *  old page-header subtitle. Hidden during the skeleton so
           *  it doesn't pop in before counts are known. */}
          {statusText ? (
            <div className="border-t border-border/40 px-6 py-2 text-xs text-muted-foreground/70">
              {statusText}
            </div>
          ) : null}
        </div>
      </ItemContextMenu>
    </div>
  );
}

function buildSubtitle(folderCount: number, fileCount: number): string {
  if (folderCount === 0 && fileCount === 0) return "Empty folder";
  const parts: string[] = [];
  if (folderCount > 0) {
    parts.push(folderCount === 1 ? "1 folder" : `${folderCount} folders`);
  }
  if (fileCount > 0) {
    parts.push(fileCount === 1 ? "1 file" : `${fileCount} files`);
  }
  return parts.join(" · ");
}

function CenteredEmpty({
  folderName,
  onCreate,
  onCreateFolder,
}: {
  folderName: string | null;
  onCreate: () => void;
  onCreateFolder: () => void;
}) {
  return (
    <div className="flex flex-1 items-center justify-center px-6">
      <EmptyDeskNote
        seed={`empty-${folderName ?? "root"}`}
        title={folderName ? `"${folderName}" is empty` : "Nothing here yet"}
        body="Pick a file type and start drawing — your first file is one click away."
        action={
          <div className="flex flex-wrap items-center justify-center gap-2">
            <NewFileButton onClick={onCreate} size="lg" />
            <Button onClick={onCreateFolder} variant="outline" size="lg">
              <HugeiconsIcon icon={FolderAddIcon} strokeWidth={2} />
              New folder
            </Button>
          </div>
        }
      />
    </div>
  );
}
