// FolderCard — file-explorer tile for a folder.
//
// Visual: a Dolphin/Finder-style folder silhouette built from two
// stacked `RoughBox`es — a back panel with a notched tab on the
// top-left (the `folder-tab` shape) and a slightly-shorter front pocket
// overlapping it. The folder name sits *below* the icon as a plain
// label, matching native file managers.
//
// Interaction model:
//   - single click  → opens the folder (`onOpen`)
//   - right click   → context menu (consumer wires via
//                     `<ContextMenuTrigger>` / `<ItemContextMenu>`)
//   - keyboard      → Tab focuses; Enter / F2 / Delete handled by
//                     `useExplorerHotkeys` based on focused card.
//
// Hover is intentionally restrained: a soft paper shadow appears, no
// scale, no translate — the silhouette itself is the affordance.

import { MoreHorizontalIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { Ref } from "react";

import { RoughBox } from "@/components/rough";
import { cn } from "@/lib/utils";
import { tiltFromId } from "./tilt";

export interface FolderCardProps {
  id: string;
  name: string;
  /** Number of scenes directly inside this folder. */
  sceneCount?: number | null;
  /** Slot for a hover-revealed actions trigger (DropdownMenu trigger). */
  actions?: React.ReactNode;
  /** Single click — opens the folder. */
  onOpen?: () => void;
  onContextMenu?: React.MouseEventHandler<HTMLButtonElement>;
  className?: string;
}

export function FolderCard({
  id,
  name,
  sceneCount,
  actions,
  onOpen,
  onContextMenu,
  className,
  ref,
}: FolderCardProps & { ref?: Ref<HTMLDivElement> }) {
  const tilt = tiltFromId(`folder:${id}`, 0.4);
  const countLabel =
    sceneCount == null ? null : sceneCount === 1 ? "1 scene" : `${sceneCount} scenes`;

  return (
    <div
      ref={ref}
      data-explorer-item="folder"
      data-explorer-id={id}
      className={cn(
        "group/folder relative flex flex-col items-center gap-2 rounded-md transition-shadow duration-150",
        "hover:shadow-[0_6px_18px_-10px_rgba(28,24,20,0.3)] dark:hover:shadow-[0_6px_18px_-10px_rgba(0,0,0,0.55)]",
        "focus-within:ring-2 focus-within:ring-vermillion/60",
        className,
      )}
      style={{ transform: `rotate(${tilt}deg)` }}
    >
      <button
        type="button"
        aria-label={`Folder: ${name}`}
        onClick={onOpen}
        onContextMenu={onContextMenu}
        className={cn(
          "flex w-full flex-col items-center gap-2 rounded-md bg-transparent p-2",
          "focus-visible:outline-none",
        )}
      >
        <FolderGlyph id={id} />

        <div className="w-full min-w-0 text-center">
          <div className="truncate font-heading text-sm text-ink" title={name}>
            {name}
          </div>
          {countLabel ? <div className="truncate text-xs text-ink-muted">{countLabel}</div> : null}
        </div>
      </button>

      {actions ? (
        <div className="absolute right-1 top-1 z-10 opacity-0 transition-opacity group-hover/folder:opacity-100 focus-within:opacity-100">
          {actions}
        </div>
      ) : null}
    </div>
  );
}

/** Manila folder silhouette: notched-tab back panel + front pocket. */
function FolderGlyph({ id }: { id: string }) {
  return (
    <div className="relative w-full" style={{ aspectRatio: "4 / 3" }} aria-hidden>
      {/* Back panel: notched tab on the top-left, fills the full glyph. */}
      <RoughBox
        shape="folder-tab"
        seed={`folder-back:${id}`}
        stroke="var(--color-stroke-card)"
        strokeWidth={1.4}
        fill="var(--color-manila)"
        fillStyle="solid"
        roughness={0.9}
        bowing={1}
        tabWidth={0.34}
        tabHeight={14}
        tabSlope={8}
      />
      {/* Front pocket: shorter than the back panel so the tab peeks
       *  above. Slightly inset on the sides. */}
      <div className="absolute inset-x-1 bottom-0 top-[22%]">
        <RoughBox
          shape="rounded"
          seed={`folder-front:${id}`}
          stroke="var(--color-stroke-card)"
          strokeWidth={1.4}
          fill="var(--color-manila-soft)"
          fillStyle="solid"
          roughness={0.9}
          bowing={1}
          radius={4}
        />
      </div>
    </div>
  );
}

/** Convenience icon for a "more actions" trigger. */
export function FolderCardActionsIcon() {
  return <HugeiconsIcon icon={MoreHorizontalIcon} strokeWidth={2} />;
}
