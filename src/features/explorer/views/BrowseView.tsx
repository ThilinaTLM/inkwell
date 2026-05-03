// BrowseView — the file-explorer pane.
//
//   /                       → root (folders + scenes with `folder_id IS NULL`)
//   /?folder=<id>           → that folder's direct children
//
// Layout:
//   - Page header: path strip (breadcrumb) + folder name title +
//     "X folders · Y scenes" subtitle + "New folder" and "New scene"
//     buttons.
//   - Body: two captioned sections ("Folders", "Scenes"), each its
//     own responsive grid. The whole body is the empty-area
//     `<ItemContextMenu>` target so right-click anywhere creates new.

import { FolderAddIcon, Image01Icon, PlusSignIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { SkeletonGrid } from "@/components/SkeletonGrid";
import { EmptyDeskNote, FolderCard, SceneCard } from "@/components/sketch";
import { Button } from "@/components/ui/button";
import { useScenes } from "@/features/explorer/hooks";
import { folderPath } from "@/features/folders/FolderTree";
import type { FolderMeta } from "@/lib/api/client";
import { relTime } from "@/lib/format";

import { Breadcrumb } from "../Breadcrumb";
import { ExplorerPageHeader } from "../ExplorerPageHeader";
import { ItemContextMenu, type ItemMenuActions } from "../ItemContextMenu";
import { SectionHeading } from "@/components/SectionHeading";
import { useExplorerHotkeys } from "../useExplorerHotkeys";

interface BrowseViewProps {
  /** Currently open folder, or `null` to browse the root. */
  folderId: string | null;
  onChangeFolder: (id: string | null) => void;
  /** Pre-loaded folder list (whole tree) from the dashboard. */
  folders: FolderMeta[] | null;
  actions: ItemMenuActions;
}

const GRID_CLASSES =
  "grid grid-cols-2 gap-3 px-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7";

export function BrowseView({ folderId, onChangeFolder, folders, actions }: BrowseViewProps) {
  const scenesQuery = useScenes({ folderId: folderId ?? "root" });
  const navigate = useNavigate();
  const scenes = scenesQuery.data ?? null;

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
      if (item.kind === "scene") {
        const s = scenes?.find((x) => x.id === item.id);
        if (s) actions.renameScene(s);
      } else {
        const f = folders?.find((x) => x.id === item.id);
        if (f) actions.renameFolder(f);
      }
    },
    onDelete: (item) => {
      if (item.kind === "scene") {
        const s = scenes?.find((x) => x.id === item.id);
        if (s) actions.deleteScene(s);
      } else {
        const f = folders?.find((x) => x.id === item.id);
        if (f) actions.deleteFolder(f);
      }
    },
    onOpen: (item) => {
      if (item.kind === "scene") {
        const s = scenes?.find((x) => x.id === item.id);
        if (s) actions.openScene(s);
      } else {
        const f = folders?.find((x) => x.id === item.id);
        if (f) onChangeFolder(f.id);
      }
    },
  });

  const isLoading = scenes === null || folders === null;
  const isEmpty = !isLoading && subfolders.length === 0 && (scenes?.length ?? 0) === 0;

  // Heading-variant breadcrumb doubles as the page title: at root it
  // renders just "Home"; inside a folder it renders "Home › Parent ›
  // Current" at title size, with ancestors clickable. This avoids the
  // duplicate "breadcrumb on top, folder name below" stutter.
  const titleNode = <Breadcrumb path={breadcrumb} onJump={onChangeFolder} variant="heading" />;
  const subtitle = isLoading ? undefined : buildSubtitle(subfolders.length, scenes?.length ?? 0);

  const body = (
    <ItemContextMenu
      target={{ kind: "empty", folderId }}
      actions={actions}
      className="flex flex-1 flex-col min-h-0"
    >
      <div className="flex flex-1 flex-col min-h-0 pb-16">
        {isLoading ? (
          <div className="px-6 pt-4">
            <SkeletonGrid />
          </div>
        ) : isEmpty ? (
          <CenteredEmpty
            folderName={breadcrumb.length ? breadcrumb[breadcrumb.length - 1].name : null}
            onCreateScene={() => actions.createSceneIn(folderId)}
            onCreateFolder={() => actions.createFolderIn(folderId)}
          />
        ) : (
          <>
            {subfolders.length > 0 && (
              <>
                <SectionHeading label="Folders" count={subfolders.length} />
                <div className={GRID_CLASSES}>
                  {subfolders.map((f) => (
                    <ItemContextMenu
                      key={f.id}
                      target={{ kind: "folder", folder: f }}
                      actions={actions}
                    >
                      <FolderCard
                        id={f.id}
                        name={f.name}
                        sceneCount={f.sceneCount}
                        previews={f.previews}
                        onOpen={() => onChangeFolder(f.id)}
                      />
                    </ItemContextMenu>
                  ))}
                </div>
              </>
            )}
            {(scenes?.length ?? 0) > 0 && (
              <>
                <SectionHeading label="Scenes" count={scenes?.length} />
                <div className={GRID_CLASSES}>
                  {scenes?.map((s) => (
                    <ItemContextMenu
                      key={s.id}
                      target={{ kind: "scene", scene: s }}
                      actions={actions}
                    >
                      <SceneCard
                        id={s.id}
                        name={s.name}
                        hasThumb={s.hasThumb}
                        thumbUrl={`/api/scenes/${s.id}/thumb?v=${s.thumbUpdatedAt}`}
                        folderName={null}
                        updatedAtLabel={relTime(s.updatedAt)}
                        tags={s.tags}
                        onOpen={() => navigate(`/s/${s.id}`)}
                      />
                    </ItemContextMenu>
                  ))}
                </div>
              </>
            )}
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
          <Button onClick={() => actions.createSceneIn(folderId)}>
            <HugeiconsIcon icon={Image01Icon} strokeWidth={1.7} />
            New scene
          </Button>
        }
      />

      {body}
    </div>
  );
}

function buildSubtitle(folderCount: number, sceneCount: number): string {
  if (folderCount === 0 && sceneCount === 0) return "Empty folder";
  const parts: string[] = [];
  if (folderCount > 0) {
    parts.push(folderCount === 1 ? "1 folder" : `${folderCount} folders`);
  }
  if (sceneCount > 0) {
    parts.push(sceneCount === 1 ? "1 scene" : `${sceneCount} scenes`);
  }
  return parts.join(" · ");
}

function CenteredEmpty({
  folderName,
  onCreateScene,
  onCreateFolder,
}: {
  folderName: string | null;
  onCreateScene: () => void;
  onCreateFolder: () => void;
}) {
  return (
    <div className="flex flex-1 items-center justify-center px-6">
      <EmptyDeskNote
        seed={`empty-${folderName ?? "root"}`}
        title={folderName ? `"${folderName}" is empty` : "Nothing here yet"}
        body="Start sketching — your first scene is one click away."
        action={
          <div className="flex flex-wrap items-center justify-center gap-2">
            <Button onClick={onCreateScene} size="lg">
              <HugeiconsIcon icon={PlusSignIcon} strokeWidth={2} />
              New scene
            </Button>
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
