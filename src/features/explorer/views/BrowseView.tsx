// BrowseView — the file-explorer pane.
//
//   /                       → root (folders + files with `folder_id IS NULL`)
//   /folders/:folderId      → that folder's direct children
//
// Layout:
//   - Page header: path strip (breadcrumb) + folder name title +
//     "X folders · Y files" subtitle + "New folder" outline button +
//     `<NewFileSplitButton>` (primary action defaults to the user's
//     last-picked file kind, dropdown lets them pick the other).
//   - Body: a single responsive grid containing folders first, then
//     files. The whole body is the empty-area `<ItemContextMenu>`
//     target so right-click anywhere creates new.

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
import { ExplorerPageHeader } from "../ExplorerPageHeader";
import { ItemContextMenu, type ItemMenuActions } from "../ItemContextMenu";
import { NewFileSplitButton } from "../NewFileSplitButton";
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
  const subtitle = isLoading ? undefined : buildSubtitle(subfolders.length, files?.length ?? 0);

  // The body sits on a subtly lifted "deck" surface — `bg-muted/40`
  // tints just enough above `--background` to separate the working
  // area from the page-header chrome, in both light and dark themes.
  // Inset on all four sides with a hairline border + rounded corners
  // so the panel reads as a self-contained tray rather than a wall.
  const body = (
    <ItemContextMenu
      target={{ kind: "empty", folderId }}
      actions={actions}
      className="flex flex-1 flex-col min-h-0"
    >
      <div className="mx-3 mb-3 flex flex-1 flex-col min-h-0 rounded-2xl border border-border/50 bg-muted/40 py-4">
        {isLoading ? (
          <div className="px-6">
            <SkeletonGrid />
          </div>
        ) : isEmpty ? (
          <CenteredEmpty
            folderName={breadcrumb.length ? breadcrumb[breadcrumb.length - 1].name : null}
            onCreate={(kind) => actions.createFileIn(folderId, kind)}
            onCreateFolder={() => actions.createFolderIn(folderId)}
          />
        ) : (
          <>
            {/* Single grid: folders first, then files. Folder/file
             *  keys are prefixed so a folder and a file with the
             *  same uuid can never collide in React's reconciler. */}
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
            {/* Spacer fills remaining height so right-click reaches
             *  the bottom of the working area. */}
            <div className="flex-1" />
          </>
        )}
      </div>
    </ItemContextMenu>
  );

  return (
    <div ref={containerRef} className="flex flex-1 flex-col min-h-0" tabIndex={-1}>
      <ExplorerPageHeader
        title={titleNode}
        subtitle={subtitle}
        secondaryAction={
          <Button variant="outline" onClick={() => actions.createFolderIn(folderId)}>
            <HugeiconsIcon icon={FolderAddIcon} strokeWidth={1.7} />
            New folder
          </Button>
        }
        primaryAction={
          <NewFileSplitButton onCreate={(kind) => actions.createFileIn(folderId, kind)} />
        }
      />

      {body}
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
  onCreate: (kind: import("@/lib/api/client").FileKind) => void;
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
            <NewFileSplitButton onCreate={onCreate} size="lg" />
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
