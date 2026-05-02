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

import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  FolderAddIcon,
  Image01Icon,
  PlusSignIcon,
} from "@hugeicons/core-free-icons";
import { toast } from "sonner";

import {
  ApiError,
  FolderMeta,
  SceneMeta,
  scenes as scenesApi,
} from "@/api";
import { Button } from "@/components/ui/button";
import { EmptyDeskNote, FolderCard, SceneCard } from "@/components/sketch";
import { folderPath } from "@/components/FolderTree";

import { Breadcrumb } from "./Breadcrumb";
import { AddTile } from "./AddTile";
import { ItemContextMenu, type ItemMenuActions } from "./ItemContextMenu";
import { useExplorerHotkeys } from "./useExplorerHotkeys";

interface BrowseViewProps {
  /** Currently open folder, or `null` to browse the root. */
  folderId: string | null;
  onChangeFolder: (id: string | null) => void;
  /** Pre-loaded folder list (whole tree) from the dashboard. */
  folders: FolderMeta[] | null;
  actions: ItemMenuActions;
  /** Re-trigger after a mutation invalidates the per-folder scene list. */
  refreshTick?: number;
}

export function BrowseView({
  folderId,
  onChangeFolder,
  folders,
  actions,
  refreshTick = 0,
}: BrowseViewProps) {
  const [scenes, setScenes] = useState<SceneMeta[] | null>(null);
  const navigate = useNavigate();

  // Load scenes for the current scope.
  useEffect(() => {
    let alive = true;
    setScenes(null);
    scenesApi
      .list({ folderId: folderId ?? "root" })
      .then((rows) => {
        if (alive) setScenes(rows);
      })
      .catch((e: ApiError) => {
        if (alive) {
          toast.error(e.message || "could not load scenes");
          setScenes([]);
        }
      });
    return () => {
      alive = false;
    };
  }, [folderId, refreshTick]);

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
    <div className="grid grid-cols-2 gap-4 px-6 pt-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
      {Array.from({ length: 12 }).map((_, i) => (
        <div
          key={i}
          className="aspect-[4/3] w-full animate-pulse rounded-md bg-paper-edge/50"
        />
      ))}
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

function relTime(ms: number): string {
  const diff = Date.now() - ms;
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(ms).toLocaleDateString();
}
