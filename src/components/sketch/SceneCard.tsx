// SceneCard — file-explorer tile for a scene. The thumbnail is the
// "artwork", the name is in Excalifont, the meta line is in IBM Plex
// Sans, and tags appear as TapeChips.
//
// Interaction model (parity with `FolderCard`):
//   - single click  → focus / select
//   - double click  → open
//   - right click   → context menu (rendered by the consumer via the
//                     `onContextMenu` prop wired up to `<ContextMenuTrigger>`)
//   - keyboard      → Tab focuses the card; Enter / F2 / Delete are
//                     consumed by `useExplorerHotkeys` based on which
//                     card has focus.
//
// The card is a focusable `<div role="button">` so right-click and
// keyboard focus behave the same way they do on real OS file explorers.
// To preserve "open in new tab" affordances we expose `Open in new tab`
// in the right-click menu.

import { forwardRef } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Image01Icon, MoreHorizontalIcon } from "@hugeicons/core-free-icons";
import { cn } from "@/lib/utils";
import { RoughBox } from "@/components/rough";
import { TapeChip } from "./TapeChip";
import { tiltFromId } from "./tilt";

export interface SceneCardProps {
  id: string;
  name: string;
  hasThumb: boolean;
  thumbUrl: string;
  folderName?: string | null;
  updatedAtLabel: string;
  tags: string[];
  /** Slot for a hover-revealed actions trigger (DropdownMenu trigger). */
  actions?: React.ReactNode;
  /** Single click — moves focus / selects the card. */
  onSelect?: () => void;
  /** Double click — opens the scene. */
  onOpen?: () => void;
  /** Right click — open the context menu. */
  onContextMenu?: React.MouseEventHandler<HTMLDivElement>;
  /** True when this card is the explorer's "current" item. Visible focus
   *  ring + shadow lift; also exposed as `data-selected` for hotkey code. */
  selected?: boolean;
  className?: string;
}

export const SceneCard = forwardRef<HTMLDivElement, SceneCardProps>(
  function SceneCard(
    {
      id,
      name,
      hasThumb,
      thumbUrl,
      folderName,
      updatedAtLabel,
      tags,
      actions,
      onSelect,
      onOpen,
      onContextMenu,
      selected,
      className,
    },
    ref
  ) {
    const tilt = tiltFromId(`scene:${id}`, 0.4);

    return (
      <div
        ref={ref}
        role="button"
        tabIndex={0}
        aria-label={`Scene: ${name}`}
        data-selected={selected || undefined}
        data-explorer-item="scene"
        data-explorer-id={id}
        onClick={onSelect}
        onDoubleClick={onOpen}
        onContextMenu={onContextMenu}
        onKeyDown={(e) => {
          if (e.key === " ") {
            e.preventDefault();
            onSelect?.();
          }
        }}
        className={cn(
          "group/scene relative isolate flex flex-col overflow-hidden rounded-md transition-all duration-200",
          "hover:-translate-y-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vermillion/60",
          "data-[selected]:ring-2 data-[selected]:ring-vermillion/70",
          className
        )}
        style={{ transform: `rotate(${tilt}deg)` }}
      >
        {/* Card silhouette */}
        <RoughBox
          shape="card"
          seed={`scene-card:${id}`}
          stroke="var(--color-stroke-card)"
          strokeWidth={1.5}
          fill="var(--color-paper-elev)"
          fillStyle="solid"
          roughness={0.9}
          bowing={1}
          radius={10}
        />
        {/* Hover / selected shadow */}
        <span
          aria-hidden
          className={cn(
            "pointer-events-none absolute inset-0 -z-10 rounded-md transition-opacity duration-200",
            "shadow-[0_10px_30px_-10px_rgba(28,24,20,0.3)] dark:shadow-[0_10px_30px_-10px_rgba(0,0,0,0.55)]",
            "opacity-0 group-hover/scene:opacity-100",
            "group-data-[selected]/scene:opacity-100"
          )}
        />

        {/* Thumbnail */}
        <div className="relative aspect-[4/3] w-full overflow-hidden">
          {hasThumb ? (
            <img
              src={thumbUrl}
              alt=""
              loading="lazy"
              draggable={false}
              className="h-full w-full object-contain transition-transform duration-300 group-hover/scene:scale-[1.02]"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-ink-muted/60">
              <HugeiconsIcon
                icon={Image01Icon}
                strokeWidth={1.4}
                className="size-12"
              />
            </div>
          )}
        </div>

        {/* Meta */}
        <div className="relative flex items-start gap-2 px-3 pb-3 pt-2">
          <div className="min-w-0 flex-1">
            <span
              className="block w-full truncate text-left font-heading text-base text-ink"
              title={name}
            >
              {name}
            </span>
            <div className="mt-0.5 flex items-center gap-1.5 text-xs text-ink-muted">
              {folderName && <span className="truncate">{folderName}</span>}
              {folderName && <span aria-hidden>·</span>}
              <span>{updatedAtLabel}</span>
            </div>
            {tags.length > 0 && (
              <div className="mt-1.5 flex flex-wrap items-center gap-1">
                {tags.slice(0, 3).map((t) => (
                  <TapeChip key={t} label={t} size="sm" asStatic active />
                ))}
                {tags.length > 3 && (
                  <span className="text-xs text-ink-muted">
                    +{tags.length - 3}
                  </span>
                )}
              </div>
            )}
          </div>
          {actions && (
            <div
              className="shrink-0"
              onClick={(e) => e.stopPropagation()}
              onDoubleClick={(e) => e.stopPropagation()}
            >
              {actions}
            </div>
          )}
        </div>
      </div>
    );
  }
);

/** Convenience icon for a "more actions" trigger. */
export function SceneCardActionsIcon() {
  return <HugeiconsIcon icon={MoreHorizontalIcon} strokeWidth={2} />;
}
