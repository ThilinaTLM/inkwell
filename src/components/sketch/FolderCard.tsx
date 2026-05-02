// FolderCard — file-explorer tile for a folder. Visual peer of
// `SceneCard`: same `RoughBox shape="card"` shell, same 4:3 aspect
// ratio, same hover lift, same `tiltFromId` per-id rotation. The body
// shows a centred `Folder01Icon` instead of a thumbnail.
//
// Replaces the old `FolderTab` component (which drew an angled manila
// folder tab + body). Folders are no longer styled as literal manila
// tabs — they're plain cards with a folder glyph, sitting on the same
// `paper-elev` surface as scenes.
//
// Interaction model is identical to `SceneCard`:
//   - single click  → select / focus
//   - double click  → open
//   - right click   → context menu (consumer wires via `<ContextMenuTrigger>`)
//   - keyboard      → Tab focuses; Enter / F2 / Delete handled by
//                     `useExplorerHotkeys` based on focused card.

import { forwardRef } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Folder01Icon, MoreHorizontalIcon } from "@hugeicons/core-free-icons";

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
  onSelect?: () => void;
  onOpen?: () => void;
  onContextMenu?: React.MouseEventHandler<HTMLDivElement>;
  selected?: boolean;
  className?: string;
}

export const FolderCard = forwardRef<HTMLDivElement, FolderCardProps>(
  function FolderCard(
    {
      id,
      name,
      sceneCount,
      actions,
      onSelect,
      onOpen,
      onContextMenu,
      selected,
      className,
    },
    ref
  ) {
    const tilt = tiltFromId(`folder:${id}`, 0.7);
    const countLabel =
      sceneCount == null
        ? "—"
        : sceneCount === 1
          ? "1 scene"
          : `${sceneCount} scenes`;

    return (
      <div
        ref={ref}
        role="button"
        tabIndex={0}
        aria-label={`Folder: ${name}`}
        data-selected={selected || undefined}
        data-explorer-item="folder"
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
          "group/folder relative isolate flex flex-col overflow-hidden rounded-md transition-all duration-200",
          "hover:-translate-y-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vermillion/60",
          "data-[selected]:ring-2 data-[selected]:ring-vermillion/70",
          className
        )}
        style={{ transform: `rotate(${tilt}deg)` }}
      >
        {/* Card silhouette */}
        <RoughBox
          shape="card"
          seed={`folder-card:${id}`}
          stroke="var(--color-ink-soft)"
          strokeWidth={1.4}
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
            "shadow-[0_10px_30px_-10px_rgba(28,24,20,0.3)]",
            "opacity-0 group-hover/folder:opacity-100",
            "group-data-[selected]/folder:opacity-100"
          )}
        />

        {/* Glyph "thumbnail" */}
        <div className="relative grid aspect-[4/3] w-full place-items-center text-ink-soft">
          <HugeiconsIcon
            icon={Folder01Icon}
            strokeWidth={1.5}
            className="size-16 transition-transform duration-300 group-hover/folder:scale-[1.04]"
          />
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
            <div className="mt-0.5 font-hand text-sm text-ink-muted">
              {countLabel}
            </div>
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
export function FolderCardActionsIcon() {
  return <HugeiconsIcon icon={MoreHorizontalIcon} strokeWidth={2} />;
}
