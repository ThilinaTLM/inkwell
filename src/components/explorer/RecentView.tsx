// RecentView — flat grid of the user's most-recently-updated scenes.
//
// Loads `scenes.list({})` (no folder filter, no tag filter, no query)
// and shows the first 50 results. The server already orders by
// `updated_at desc`, so a simple slice is sufficient.
//
// Each card carries the parent folder name (or "Top level" for root
// scenes) so users know where the scene actually lives. Right-click
// shows the same scene actions as Browse.

import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { HugeiconsIcon } from "@hugeicons/react";
import { PlusSignIcon } from "@hugeicons/core-free-icons";
import { toast } from "sonner";

import {
  ApiError,
  FolderMeta,
  SceneMeta,
  scenes as scenesApi,
} from "@/api";
import { Button } from "@/components/ui/button";
import { EmptyDeskNote, SceneCard } from "@/components/sketch";

import { ItemContextMenu, type ItemMenuActions } from "./ItemContextMenu";
import { useExplorerHotkeys } from "./useExplorerHotkeys";

const RECENT_LIMIT = 50;

interface RecentViewProps {
  /** Owner's folder list, used to label each scene with its parent folder. */
  folders: FolderMeta[] | null;
  actions: ItemMenuActions;
  refreshTick?: number;
}

export function RecentView({
  folders,
  actions,
  refreshTick = 0,
}: RecentViewProps) {
  const [scenes, setScenes] = useState<SceneMeta[] | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    let alive = true;
    setScenes(null);
    scenesApi
      .list({})
      .then((rows) => {
        if (alive) setScenes(rows.slice(0, RECENT_LIMIT));
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
  }, [refreshTick]);

  const folderById = useMemo(() => {
    return new Map((folders ?? []).map((f) => [f.id, f]));
  }, [folders]);

  const containerRef = useRef<HTMLDivElement | null>(null);
  useExplorerHotkeys(containerRef, {
    onRename: (item) => {
      if (item.kind !== "scene") return;
      const s = scenes?.find((x) => x.id === item.id);
      if (s) actions.renameScene(s);
    },
    onDelete: (item) => {
      if (item.kind !== "scene") return;
      const s = scenes?.find((x) => x.id === item.id);
      if (s) actions.deleteScene(s);
    },
    onOpen: (item) => {
      if (item.kind !== "scene") return;
      const s = scenes?.find((x) => x.id === item.id);
      if (s) actions.openScene(s);
    },
  });

  if (scenes === null) return <Skeleton />;

  if (scenes.length === 0) {
    return (
      <EmptyDeskNote
        seed="recent-empty"
        title="No scenes yet"
        body="Once you create a scene it will land here, sorted by when you last edited it."
        action={
          <Button onClick={() => actions.createSceneIn(null)} size="lg">
            <HugeiconsIcon icon={PlusSignIcon} strokeWidth={2} />
            New scene
          </Button>
        }
      />
    );
  }

  return (
    <div ref={containerRef} className="flex flex-col" tabIndex={-1}>
      <div className="grid grid-cols-2 gap-4 px-6 pb-16 pt-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
        {scenes.map((s) => {
          const parent = s.folderId ? folderById.get(s.folderId) : null;
          return (
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
                folderName={parent?.name ?? "Top level"}
                updatedAtLabel={relTime(s.updatedAt)}
                tags={s.tags}
                onOpen={() => navigate(`/s/${s.id}`)}
              />
            </ItemContextMenu>
          );
        })}
      </div>
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
