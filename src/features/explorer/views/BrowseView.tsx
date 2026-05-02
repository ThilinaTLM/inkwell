// BrowseView — the file-explorer pane.
//
//   /                       → root (folders + scenes with `folder_id IS NULL`)
//   /?folder=<id>           → that folder's direct children
//
// Renders a `<Breadcrumb>` followed by a single CSS grid of folder cards
// + scene cards + two `<AddTile>`s (`+ Folder`, `+ Scene`) at the end.
//
// Right-click on the empty grid background opens the "empty area"
// context menu (New scene / New folder). Right-click on a card opens
// the matching item context menu.

import { useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  FolderAddIcon,
  Image01Icon,
  PlusSignIcon,
} from "@hugeicons/core-free-icons";

import type { FolderMeta } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { SkeletonGrid } from "@/components/SkeletonGrid";
import { EmptyDeskNote, FolderCard, SceneCard } from "@/components/sketch";
import { folderPath } from "@/features/folders/FolderTree";
import { useScenes } from "@/features/explorer/hooks";
import { relTime } from "@/lib/format";

import { Breadcrumb } from "../Breadcrumb";
import { AddTile } from "../AddTile";
import { ItemContextMenu, type ItemMenuActions } from "../ItemContextMenu";
import { useExplorerHotkeys } from "../useExplorerHotkeys";

interface BrowseViewProps {
  /** Currently open folder, or `null` to browse the root. */
  folderId: string | null;
  onChangeFolder: (id: string | null) => void;
  /** Pre-loaded folder list (whole tree) from the dashboard. */
  folders: FolderMeta[] | null;
  actions: ItemMenuActions;
}

export function BrowseView({
  folderId,
  onChangeFolder,
  folders,
  actions,
}: BrowseViewProps) {
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

  return (
    <div ref={containerRef} className="flex flex-col" tabIndex={-1}>
      <Breadcrumb path={breadcrumb} onJump={onChangeFolder} />

      {isLoading ? (
        <Skeleton />
      ) : subfolders.length === 0 && scenes!.length === 0 ? (
        <Empty
          folderName={breadcrumb.length ? breadcrumb[breadcrumb.length - 1].name : null}
          onCreateScene={() => actions.createSceneIn(folderId)}
          onCreateFolder={() => actions.createFolderIn(folderId)}
        />
      ) : (
        <ItemContextMenu
          target={{ kind: "empty", folderId }}
          actions={actions}
          className="block"
        >
          <div
            className="grid grid-cols-2 gap-4 px-6 pb-16 pt-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6"
          >
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
                  onSelect={() => {
                    /* focus moves on click automatically */
                  }}
                  onOpen={() => onChangeFolder(f.id)}
                />
              </ItemContextMenu>
            ))}
            {scenes!.map((s) => (
              <ItemContextMenu
                key={s.id}
                target={{ kind: "scene", scene: s }}
                actions={actions}
              >
                <SceneCard
                  id={s.id}
                  name={s.name}
                  hasThumb={s.hasThumb}
                  thumbUrl={`/api/scenes/${s.id}/thumb?v=${s.version}`}
                  folderName={null}
                  updatedAtLabel={relTime(s.updatedAt)}
                  tags={s.tags}
                  onOpen={() => navigate(`/s/${s.id}`)}
                />
              </ItemContextMenu>
            ))}
            <AddTile
              label="New folder"
              icon={
                <HugeiconsIcon
                  icon={FolderAddIcon}
                  strokeWidth={1.7}
                  className="size-7"
                />
              }
              onClick={() => actions.createFolderIn(folderId)}
            />
            <AddTile
              label="New scene"
              icon={
                <HugeiconsIcon
                  icon={Image01Icon}
                  strokeWidth={1.7}
                  className="size-7"
                />
              }
              onClick={() => actions.createSceneIn(folderId)}
            />
          </div>
        </ItemContextMenu>
      )}
    </div>
  );
}

function Skeleton() {
  return (
    <div className="px-6 pt-4">
      <SkeletonGrid />
    </div>
  );
}

function Empty({
  folderName,
  onCreateScene,
  onCreateFolder,
}: {
  folderName: string | null;
  onCreateScene: () => void;
  onCreateFolder: () => void;
}) {
  return (
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
  );
}

