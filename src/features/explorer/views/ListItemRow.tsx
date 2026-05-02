// ListItemRow — dense row used by Browse / Recent / Search when the
// layout toggle is set to "list". Same data-attributes contract as
// SceneCard / FolderCard so `useExplorerHotkeys` works without
// modification.
//
// Visual rules:
//   - No RoughBox, no tilt. List mode is the "tidy drawer" alternative
//     to the rough-card grid; rough strokes would defeat the purpose.
//   - Names stay in `font-heading` (artifact name).
//   - Folder breadcrumb, updated label, "+N" tag overflow are
//     `font-sans` for scannability.
//   - Tags still render as TapeChips (TapeChip carries its own
//     RoughBox; it's content per the design rule).

import { forwardRef } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Folder01Icon,
  Image01Icon,
  MoreHorizontalIcon,
} from "@hugeicons/core-free-icons";

import { TapeChip } from "@/components/sketch";
import { cn } from "@/lib/utils";

interface ListItemRowProps {
  kind: "scene" | "folder";
  id: string;
  name: string;
  /** Parent folder name (or "Top level"). Optional for Browse, where
   *  every visible scene lives in the current folder. */
  folderName?: string | null;
  /** SVG thumbnail URL — only used when kind === "scene" && hasThumb. */
  thumbUrl?: string;
  hasThumb?: boolean;
  /** Counts/labels — kept loose so callers can format them. */
  metaLabel?: string;
  tags?: string[];
  actions?: React.ReactNode;
  selected?: boolean;
  onSelect?: () => void;
  onOpen?: () => void;
  onContextMenu?: React.MouseEventHandler<HTMLDivElement>;
  className?: string;
}

export const ListItemRow = forwardRef<HTMLDivElement, ListItemRowProps>(
  function ListItemRow(
    {
      kind,
      id,
      name,
      folderName,
      thumbUrl,
      hasThumb,
      metaLabel,
      tags,
      actions,
      selected,
      onSelect,
      onOpen,
      onContextMenu,
      className,
    },
    ref
  ) {
    return (
      <div
        ref={ref}
        role="button"
        tabIndex={0}
        aria-label={`${kind === "scene" ? "Scene" : "Folder"}: ${name}`}
        data-selected={selected || undefined}
        data-explorer-item={kind}
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
          "group/row flex items-center gap-3 border-b border-ink-soft/12 px-4 py-2 transition-colors",
          "hover:bg-paper-elev focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vermillion/60",
          "data-[selected]:bg-vermillion/8 data-[selected]:ring-1 data-[selected]:ring-vermillion/40",
          className
        )}
      >
        {/* Thumbnail / icon column */}
        <div className="grid h-10 w-12 shrink-0 place-items-center overflow-hidden rounded bg-paper text-ink-soft ring-1 ring-ink-soft/15">
          {kind === "scene" ? (
            hasThumb && thumbUrl ? (
              <img
                src={thumbUrl}
                alt=""
                loading="lazy"
                draggable={false}
                className="h-full w-full object-contain"
              />
            ) : (
              <HugeiconsIcon
                icon={Image01Icon}
                strokeWidth={1.5}
                className="size-4 opacity-60"
              />
            )
          ) : (
            <HugeiconsIcon
              icon={Folder01Icon}
              strokeWidth={1.6}
              className="size-5"
            />
          )}
        </div>

        {/* Name + folder breadcrumb */}
        <div className="min-w-0 flex-1">
          <div
            className="truncate font-heading text-sm text-ink"
            title={name}
          >
            {name}
          </div>
          {folderName ? (
            <div className="truncate text-xs text-ink-muted">{folderName}</div>
          ) : null}
        </div>

        {/* Tags — hidden on narrow viewports to keep the row tidy */}
        {tags && tags.length > 0 ? (
          <div className="hidden shrink-0 max-w-72 items-center gap-1 overflow-hidden md:flex">
            {tags.slice(0, 3).map((t) => (
              <TapeChip key={t} label={t} size="sm" asStatic active />
            ))}
            {tags.length > 3 ? (
              <span className="text-xs text-ink-muted">
                +{tags.length - 3}
              </span>
            ) : null}
          </div>
        ) : null}

        {/* Updated / count meta */}
        {metaLabel ? (
          <div className="hidden w-32 shrink-0 text-right text-xs text-ink-muted sm:block">
            {metaLabel}
          </div>
        ) : null}

        {/* Hover-revealed actions slot */}
        {actions ? (
          <div
            className="shrink-0"
            onClick={(e) => e.stopPropagation()}
            onDoubleClick={(e) => e.stopPropagation()}
          >
            {actions}
          </div>
        ) : null}
      </div>
    );
  }
);

/** Convenience icon for the row's "more actions" trigger, mirroring the
 *  one exported from the cards. */
export function ListItemRowActionsIcon() {
  return <HugeiconsIcon icon={MoreHorizontalIcon} strokeWidth={2} />;
}
