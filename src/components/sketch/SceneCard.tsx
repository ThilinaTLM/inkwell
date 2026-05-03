// SceneCard — file-explorer tile for a scene.
//
// Visual: a paper-sheet silhouette with a folded top-right corner.
// Thumbnail is clipped to fill the sheet body. Name + tags sit *below*
// the sheet as plain labels — matches the new FolderCard layout and
// native file-manager icon grids.
//
// Interaction model (parity with `FolderCard`):
//   - single click  → opens the scene (`onOpen`)
//   - right click   → context menu via the consumer's `<ContextMenuTrigger>`
//   - keyboard      → Tab focuses the card; Enter / F2 / Delete are
//                     consumed by `useExplorerHotkeys` based on which
//                     card has focus.

import { Image01Icon, MoreHorizontalIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { Ref } from "react";

import { RoughBox } from "@/components/rough";
import { cn } from "@/lib/utils";

import { TapeChip } from "./TapeChip";
import { tiltFromId } from "./tilt";

const FOLD_PX = 14;

export interface SceneCardProps {
  id: string;
  name: string;
  hasThumb: boolean;
  thumbUrl: string;
  /** Parent folder name. Currently unused in the visual (Recent shows
   *  it in the right-click menu) but kept on the prop for future use. */
  folderName?: string | null;
  updatedAtLabel: string;
  tags: string[];
  /** Slot for a hover-revealed actions trigger (DropdownMenu trigger). */
  actions?: React.ReactNode;
  /** Single click — opens the scene. */
  onOpen?: () => void;
  /** Right click — open the context menu. */
  onContextMenu?: React.MouseEventHandler<HTMLButtonElement>;
  className?: string;
}

export function SceneCard({
  id,
  name,
  hasThumb,
  thumbUrl,
  updatedAtLabel,
  tags,
  actions,
  onOpen,
  onContextMenu,
  className,
  ref,
}: SceneCardProps & { ref?: Ref<HTMLDivElement> }) {
  const tilt = tiltFromId(`scene:${id}`, 0.4);

  return (
    <div
      ref={ref}
      data-explorer-item="scene"
      data-explorer-id={id}
      title={updatedAtLabel ? `${name} · ${updatedAtLabel}` : name}
      className={cn(
        "group/scene relative flex flex-col items-center gap-2 rounded-md transition-shadow duration-150",
        "hover:shadow-[0_6px_18px_-10px_rgba(28,24,20,0.3)] dark:hover:shadow-[0_6px_18px_-10px_rgba(0,0,0,0.55)]",
        "focus-within:ring-2 focus-within:ring-ring/60",
        className,
      )}
      style={{ transform: `rotate(${tilt}deg)` }}
    >
      <button
        type="button"
        aria-label={`Scene: ${name}`}
        onClick={onOpen}
        onContextMenu={onContextMenu}
        className={cn(
          "flex w-full flex-col items-center gap-2 rounded-md bg-transparent p-2",
          "focus-visible:outline-none",
        )}
      >
        <SceneGlyph id={id} hasThumb={hasThumb} thumbUrl={thumbUrl} />

        <div className="w-full min-w-0 text-center">
          <div className="truncate font-heading text-sm text-foreground" title={name}>
            {name}
          </div>
          {tags.length > 0 ? (
            <div className="mt-1 flex flex-wrap items-center justify-center gap-1">
              {tags.slice(0, 3).map((t) => (
                <TapeChip key={t} label={t} size="sm" asStatic active />
              ))}
              {tags.length > 3 ? (
                <span className="text-xs text-muted-foreground/70">+{tags.length - 3}</span>
              ) : null}
            </div>
          ) : null}
        </div>
      </button>

      {actions ? (
        <div className="absolute right-1 top-1 z-10 opacity-0 transition-opacity group-hover/scene:opacity-100 focus-within:opacity-100">
          {actions}
        </div>
      ) : null}
    </div>
  );
}

/** Paper-sheet silhouette with a folded top-right corner. */
function SceneGlyph({
  id,
  hasThumb,
  thumbUrl,
}: {
  id: string;
  hasThumb: boolean;
  thumbUrl: string;
}) {
  return (
    <div className="relative w-full" style={{ aspectRatio: "4 / 3" }} aria-hidden>
      {/* Sheet body */}
      <RoughBox
        shape="paper-sheet"
        seed={`scene-sheet:${id}`}
        stroke="var(--color-card-stroke)"
        strokeWidth={1.4}
        fill="var(--color-card)"
        fillStyle="solid"
        roughness={0.9}
        bowing={1}
        cornerFold={FOLD_PX}
      />
      {/* Thumbnail clipped to match the sheet path so it doesn't cover
       *  the folded corner. */}
      <div
        className="absolute inset-0 overflow-hidden"
        style={{
          clipPath: `polygon(0 0, calc(100% - ${FOLD_PX}px) 0, 100% ${FOLD_PX}px, 100% 100%, 0 100%)`,
        }}
      >
        {hasThumb ? (
          <img
            src={thumbUrl}
            alt=""
            loading="lazy"
            draggable={false}
            className="h-full w-full object-contain"
          />
        ) : (
          <div className="grid h-full w-full place-items-center text-muted-foreground/40">
            <HugeiconsIcon icon={Image01Icon} strokeWidth={1.4} className="size-10" />
          </div>
        )}
      </div>
      {/* Underside of the folded corner (small triangle, folder-soft tone). */}
      <svg
        viewBox={`0 0 ${FOLD_PX} ${FOLD_PX}`}
        width={FOLD_PX}
        height={FOLD_PX}
        className="absolute right-0 top-0"
        aria-hidden
        role="presentation"
      >
        <title>Folded paper corner</title>
        <path
          d={`M0,0 L${FOLD_PX},${FOLD_PX} L0,${FOLD_PX} Z`}
          fill="var(--color-folder-soft)"
          stroke="var(--color-card-stroke)"
          strokeWidth={1}
        />
      </svg>
    </div>
  );
}

/** Convenience icon for a "more actions" trigger. */
export function SceneCardActionsIcon() {
  return <HugeiconsIcon icon={MoreHorizontalIcon} strokeWidth={2} />;
}
