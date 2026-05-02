// RecentView — flat grid of the user's most-recently-updated scenes.
//
// Loads `scenes.list({})` (no folder filter, no tag filter, no query)
// and shows the first 50 results. The server already orders by
// `updated_at desc`, so a simple slice is sufficient.
//
// Each card carries the parent folder name (or "Top level" for root
// scenes) so users know where the scene actually lives. Right-click
// shows the same scene actions as Browse.

import { useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { HugeiconsIcon } from "@hugeicons/react";
import { PlusSignIcon } from "@hugeicons/core-free-icons";

import type { FolderMeta } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { SkeletonGrid } from "@/components/SkeletonGrid";
import { EmptyDeskNote, SceneCard } from "@/components/sketch";
import { useScenes } from "@/features/explorer/hooks";
import { relTime } from "@/lib/format";

import { ItemContextMenu, type ItemMenuActions } from "../ItemContextMenu";
import { useExplorerHotkeys } from "../useExplorerHotkeys";

const RECENT_LIMIT = 50;

interface RecentViewProps {
  /** Owner's folder list, used to label each scene with its parent folder. */
  folders: FolderMeta[] | null;
  actions: ItemMenuActions;
}

export function RecentView({ folders, actions }: RecentViewProps) {
  const scenesQuery = useScenes({});
  const navigate = useNavigate();
  const scenes = useMemo(
    () => scenesQuery.data?.slice(0, RECENT_LIMIT) ?? null,
    [scenesQuery.data],
  );

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
    <div className="px-6 pt-4">
      <SkeletonGrid />
    </div>
  );
}
