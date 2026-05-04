// FolderCard — file-explorer tile for a folder.
//
// Visual: a flat-design folder built from clean SVG paths (no rough/sketch
// strokes, no drop shadows). Two-tone primary colour scheme:
//
//   - Back panel + tab → `--color-primary`
//   - Front pocket     → primary mixed with 15% black (slightly darker
//                        flat shade — works in both themes via color-mix)
//   - Inner papers     → `--color-card` with `--color-card-stroke` outline,
//                        each can be overlaid with a scene-thumbnail
//                        `<image>` when the folder has previewable scenes.
//                        Hidden behind the front pocket at rest. Only
//                        rendered when the folder actually has the
//                        corresponding preview — empty folders show no
//                        inner papers at all.
//
// Interaction model:
//   - single click  → opens the folder (`onOpen`)
//   - right click   → context menu (consumer wires via
//                     `<ContextMenuTrigger>` / `<ItemContextMenu>`)
//   - keyboard      → Tab focuses; Enter / F2 / Delete handled by
//                     `useExplorerHotkeys` based on focused card.
//
// Hover animation is **content-changing**, not chrome-changing:
//   - the inner papers (with their previews) slide up and peek above
//     the pocket lip
//   - the front pocket tilts forward (rotateX) like a flap opening
//   - the tab nudges up a couple of pixels
// All driven by CSS transforms in `index.css` (`.ink-folder__*` classes)
// so they respect `prefers-reduced-motion`.

import { Link04Icon, MoreHorizontalIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { Ref } from "react";

import type { ScenePreview } from "@/lib/api/client";
import { cn } from "@/lib/utils";
import { tiltFromId } from "./tilt";

export interface FolderCardProps {
  id: string;
  name: string;
  /** Number of direct children (scenes + subfolders) inside this folder. */
  itemCount?: number | null;
  /** Up to 3 most-recently-updated scenes inside this folder, newest
   *  first. Used to render thumbnails on the inner papers. `previews[0]`
   *  sits on top of the inner-paper stack (front), `[1]` is the middle
   *  sheet, `[2]` is the back. */
  previews?: ScenePreview[];
  /** Slot for a hover-revealed actions trigger (DropdownMenu trigger). */
  actions?: React.ReactNode;
  /** Single click — opens the folder. */
  onOpen?: () => void;
  onContextMenu?: React.MouseEventHandler<HTMLButtonElement>;
  /** Number of currently-active share tokens whose target is THIS folder.
   *  When > 0, a small "shared" pill is rendered at the top-left. */
  activeShareCount?: number;
  /** Click handler for the share pill. */
  onOpenShare?: () => void;
  className?: string;
}

export function FolderCard({
  id,
  name,
  itemCount,
  previews,
  actions,
  onOpen,
  onContextMenu,
  activeShareCount = 0,
  onOpenShare,
  className,
  ref,
}: FolderCardProps & { ref?: Ref<HTMLDivElement> }) {
  const tilt = tiltFromId(`folder:${id}`, 0.4);
  const countLabel = itemCount == null ? null : itemCount === 1 ? "1 item" : `${itemCount} items`;

  return (
    <div
      ref={ref}
      data-explorer-item="folder"
      data-explorer-id={id}
      className={cn(
        "group/folder relative flex flex-col items-center gap-2 rounded-md",
        "focus-within:ring-2 focus-within:ring-ring/60",
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
        <FolderGlyph previews={previews} />

        <div className="w-full min-w-0 text-center">
          <div className="truncate font-heading text-sm text-foreground" title={name}>
            {name}
          </div>
          {countLabel ? (
            <div className="truncate text-xs text-muted-foreground/70">{countLabel}</div>
          ) : null}
        </div>
      </button>

      {activeShareCount > 0 ? <SharePill count={activeShareCount} onClick={onOpenShare} /> : null}

      {actions ? (
        <div className="absolute right-1 top-1 z-10 opacity-0 transition-opacity group-hover/folder:opacity-100 focus-within:opacity-100">
          {actions}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Top-left "shared" pill, identical to the one on SceneCard. Lives in
 * its own component for click-isolation: it stops propagation so the
 * card's parent ContextMenuTrigger doesn't fire on a left-click.
 */
function SharePill({ count, onClick }: { count: number; onClick?: () => void }) {
  const label = count === 1 ? "1 active link" : `${count} active links`;
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick?.();
      }}
      onContextMenu={(e) => e.stopPropagation()}
      title={label}
      aria-label={label}
      className="absolute left-1 top-1 z-10 inline-flex h-5 items-center gap-1 rounded-full bg-accent/70 px-1.5 text-[0.625rem] font-medium text-accent-foreground ring-1 ring-border/50 backdrop-blur-sm transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
    >
      <HugeiconsIcon icon={Link04Icon} strokeWidth={2} className="size-2.5" />
      <span>{count}</span>
    </button>
  );
}

/**
 * Flat folder silhouette. Path geometry uses a 200×150 viewBox so the
 * proportions match the previous RoughBox glyph at any size. The pocket
 * tilts forward on hover (see `.ink-folder__front` in `index.css`).
 *
 * Layer order (back → front):
 *   1. Back panel + tab        (solid primary)
 *   2. Inner papers (0–3)     (cream sheets + optional thumbnail
 *                               `<image>` overlays; peek up on hover
 *                               with staggered offsets so the most
 *                               recent comes out the most. One paper
 *                               per available preview — empty folders
 *                               render none)
 *   3. Front pocket            (primary, slightly darker; tilts on hover)
 */
function FolderGlyph({ previews }: { previews?: ScenePreview[] }) {
  // Render one inner paper rect per available preview, up to three.
  // Empty folders render no inner papers at all so nothing peeks out
  // of the pocket on hover — otherwise the blank cream sheets read as
  // phantom previews for a folder that has no scenes.
  //
  // `previews[0]` is the most recent → drawn on TOP of the stack
  // (front, `(12, 38)`). `previews[1]` sits in the middle (`(22, 42)`).
  // `previews[2]` is the oldest visible → drawn BEHIND the rest
  // (`(32, 46)`). The diagonal offsets ensure each sheet's corner peeks
  // out from behind the next when multiple previews are present.
  const front = previews?.[0];
  const mid = previews?.[1];
  const back = previews?.[2];

  // Build content-addressed thumb URLs only for previews that actually
  // have a thumbnail uploaded. SVG `<image>` rendering when `href` is
  // missing is undefined, so guard the conditional render.
  const frontThumb = front?.hasThumb
    ? `/api/scenes/${front.id}/thumb?v=${front.thumbUpdatedAt}`
    : null;
  const midThumb = mid?.hasThumb ? `/api/scenes/${mid.id}/thumb?v=${mid.thumbUpdatedAt}` : null;
  const backThumb = back?.hasThumb ? `/api/scenes/${back.id}/thumb?v=${back.thumbUpdatedAt}` : null;

  return (
    <div
      className="relative w-full [perspective:600px]"
      style={{ aspectRatio: "4 / 3" }}
      aria-hidden
    >
      <svg
        viewBox="0 0 200 150"
        preserveAspectRatio="xMidYMid meet"
        className="h-full w-full overflow-visible"
        role="presentation"
      >
        <title>Folder</title>

        {/* 1. Back panel with notched tab on top-left.
              The tab has a slanted right edge (76 → 88 over 14px tall)
              for that classic file-folder silhouette. */}
        <path
          className="ink-folder__back"
          d="M 6 26
             L 6 14
             Q 6 8 12 8
             L 70 8
             L 84 22
             L 188 22
             Q 194 22 194 28
             L 194 138
             Q 194 144 188 144
             L 12 144
             Q 6 144 6 138
             Z"
          fill="var(--color-primary)"
        />

        {/* 2. Inner papers — three stacked sheets, each in its own <g>
              so CSS can stagger their hover offsets (front extends the
              most, back the least). They sit between the back panel
              and the front pocket, so they're hidden at rest and
              translate upward on hover. Each rect has an optional
              `<image>` overlay carrying the scene preview thumbnail.
              `clipPath` on the `<image>` keeps it inside the rect's
              rounded corners. */}
        <defs>
          {/* Three named clipPaths matching each inner-paper rect.
              Using named defs (rather than inline) so the overlay
              images can reference them with `clip-path="url(#...)"`. */}
          <clipPath id="ink-folder__paper-back" clipPathUnits="userSpaceOnUse">
            <rect x="32" y="46" width="138" height="92" rx="2" />
          </clipPath>
          <clipPath id="ink-folder__paper-mid" clipPathUnits="userSpaceOnUse">
            <rect x="22" y="42" width="138" height="92" rx="2" />
          </clipPath>
          <clipPath id="ink-folder__paper-front" clipPathUnits="userSpaceOnUse">
            <rect x="12" y="38" width="138" height="92" rx="2" />
          </clipPath>
        </defs>
        {/* Back paper (oldest of the three). Only rendered when a
            third preview exists. */}
        {back ? (
          <g className="ink-folder__inner ink-folder__inner--back">
            <rect
              x="32"
              y="46"
              width="138"
              height="92"
              rx="2"
              fill="var(--color-card)"
              stroke="var(--color-card-stroke)"
              strokeWidth="1"
              strokeOpacity="0.45"
            />
            {backThumb ? (
              <image
                className="ink-thumb-img"
                href={backThumb}
                x="32"
                y="46"
                width="138"
                height="92"
                preserveAspectRatio="xMidYMid slice"
                clipPath="url(#ink-folder__paper-back)"
              />
            ) : null}
          </g>
        ) : null}
        {/* Middle paper. Only rendered when a second preview exists. */}
        {mid ? (
          <g className="ink-folder__inner ink-folder__inner--mid">
            <rect
              x="22"
              y="42"
              width="138"
              height="92"
              rx="2"
              fill="var(--color-card)"
              stroke="var(--color-card-stroke)"
              strokeWidth="1"
              strokeOpacity="0.6"
            />
            {midThumb ? (
              <image
                className="ink-thumb-img"
                href={midThumb}
                x="22"
                y="42"
                width="138"
                height="92"
                preserveAspectRatio="xMidYMid slice"
                clipPath="url(#ink-folder__paper-mid)"
              />
            ) : null}
          </g>
        ) : null}
        {/* Front paper (most recent preview). Only rendered when at
            least one preview exists. */}
        {front ? (
          <g className="ink-folder__inner ink-folder__inner--front">
            <rect
              x="12"
              y="38"
              width="138"
              height="92"
              rx="2"
              fill="var(--color-card)"
              stroke="var(--color-card-stroke)"
              strokeWidth="1"
              strokeOpacity="0.75"
            />
            {frontThumb ? (
              <image
                className="ink-thumb-img"
                href={frontThumb}
                x="12"
                y="38"
                width="138"
                height="92"
                preserveAspectRatio="xMidYMid slice"
                clipPath="url(#ink-folder__paper-front)"
              />
            ) : null}
          </g>
        ) : null}

        {/* 3. Front pocket — slightly darker primary so it reads as a
              separate plane without needing a shadow. Hover tilts it
              forward around its top edge. */}
        <path
          className="ink-folder__front"
          d="M 6 44
             Q 6 38 12 38
             L 188 38
             Q 194 38 194 44
             L 194 138
             Q 194 144 188 144
             L 12 144
             Q 6 144 6 138
             Z"
          fill="color-mix(in srgb, var(--color-primary) 85%, #000)"
        />
      </svg>
    </div>
  );
}

/** Convenience icon for a "more actions" trigger. */
export function FolderCardActionsIcon() {
  return <HugeiconsIcon icon={MoreHorizontalIcon} strokeWidth={2} />;
}
