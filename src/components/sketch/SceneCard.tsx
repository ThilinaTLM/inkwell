// SceneCard — file-explorer tile for a scene.
//
// Visual: a flat-design paper sheet with a folded top-right corner.
// Built from clean SVG paths — no rough/sketch strokes, no drop shadows.
//
//   - Sheet body  → `--color-card`, outlined with `--color-card-stroke`
//   - Fold inside → `--color-accent` (primary tint — picks up the brand
//                   warmth without competing with the thumbnail)
//   - Back stack  → two extra sheets that fan out from behind on hover,
//                   suggesting "this scene has more inside"
//
// Geometry: the front sheet uses the full 200×150 viewBox with no inset.
// SVG containers are `overflow-visible` so the ~0.7px of stroke that
// renders outside the path isn't clipped at the box edge. The thumbnail
// HTML layer uses a `clip-path` polygon in the same coordinate system,
// so its edge is pixel-aligned to the sheet outline.
//
// Interaction model (parity with `FolderCard`):
//   - single click  → opens the scene (`onOpen`)
//   - right click   → context menu via the consumer's `<ContextMenuTrigger>`
//   - keyboard      → Tab focuses the card; Enter / F2 / Delete are
//                     consumed by `useExplorerHotkeys` based on which
//                     card has focus.
//
// Hover animation (see `.ink-scene__*` in `index.css`):
//   - back-left and back-right sheets fade in and rotate outward (inset
//     from the front sheet at rest so they peek from *behind*, not beyond)
//   - front sheet stays in place (so the thumbnail doesn't jitter)
//   - everything respects `prefers-reduced-motion`.

import { Image01Icon, MoreHorizontalIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { Ref } from "react";

import { cn } from "@/lib/utils";

import { TapeChip } from "./TapeChip";
import { tiltFromId } from "./tilt";

// Fold-corner size in viewBox px (12% of 200 wide).
const FOLD = 24;

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
        "group/scene relative flex flex-col items-center gap-2 rounded-md",
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
        <SceneGlyph hasThumb={hasThumb} thumbUrl={thumbUrl} />

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

/**
 * Paper-sheet silhouette with a folded top-right corner, plus two
 * stacked sheets behind that fan out on hover.
 *
 * Layer order (back → front):
 *   1. Back-stack sheets  (SVG, hidden at rest, inset 8px from front)
 *   2. Front sheet fill   (SVG, edge-to-edge in the box)
 *   3. Thumbnail          (HTML <img>, clipped to sheet path with `object-cover`)
 *   4. Front sheet stroke + fold edge (SVG, drawn over the thumbnail)
 */
function SceneGlyph({ hasThumb, thumbUrl }: { hasThumb: boolean; thumbUrl: string }) {
  // Front-sheet path runs edge-to-edge with the folded corner cut at
  // the top-right. Tiny (3px) corner radius on the other three corners
  // for a touch of softness; the fold takes care of the top-right.
  const sheetPath = `M 0 3
     Q 0 0 3 0
     L ${200 - FOLD} 0
     L 200 ${FOLD}
     L 200 147
     Q 200 150 197 150
     L 3 150
     Q 0 150 0 147 Z`;
  // Inside-of-fold triangle (the small flap that exposes a different fill).
  const foldPath = `M ${200 - FOLD} 0 L 200 ${FOLD} L ${200 - FOLD} ${FOLD} Z`;

  // CSS clipPath in the same 0..100% space as the sheet path — image
  // edges line up with the sheet outline pixel-for-pixel.
  const foldXPct = ((200 - FOLD) / 200) * 100; // 88
  const foldYPct = (FOLD / 150) * 100; // 16
  const thumbClip = `polygon(
    0% 0%,
    ${foldXPct}% 0%,
    100% ${foldYPct}%,
    100% 100%,
    0% 100%
  )`;

  return (
    <div className="relative w-full" style={{ aspectRatio: "4 / 3" }} aria-hidden>
      {/* 1. Back stack — two sheets that fan out on hover. Inset 8px on
            every side from the 200×150 viewBox so at rest they hide
            *behind* the front sheet, and on hover peek out from behind
            (not beyond) the front silhouette. */}
      <svg
        viewBox="0 0 200 150"
        preserveAspectRatio="none"
        className="absolute inset-0 h-full w-full overflow-visible"
        role="presentation"
      >
        <title>Scene back stack</title>
        <rect
          className="ink-scene__back ink-scene__back--l"
          x="8"
          y="8"
          width="184"
          height="134"
          rx="3"
          fill="var(--color-card)"
          stroke="var(--color-card-stroke)"
          strokeOpacity="0.55"
          strokeWidth="1.2"
        />
        <rect
          className="ink-scene__back ink-scene__back--r"
          x="8"
          y="8"
          width="184"
          height="134"
          rx="3"
          fill="var(--color-card)"
          stroke="var(--color-card-stroke)"
          strokeOpacity="0.55"
          strokeWidth="1.2"
        />
      </svg>

      {/* 2. Front sheet fill (drawn under the thumbnail so the page is
            opaque even when there's no image). */}
      <svg
        viewBox="0 0 200 150"
        preserveAspectRatio="none"
        className="absolute inset-0 h-full w-full overflow-visible"
        role="presentation"
      >
        <title>Scene paper</title>
        <path d={sheetPath} fill="var(--color-card)" />
        <path d={foldPath} fill="var(--color-accent)" />
      </svg>

      {/* 3. Thumbnail clipped to the front-sheet silhouette. `object-cover`
            fills the sheet area uniformly across cards; intrinsic
            aspect-ratio differences in the source SVGs no longer cause
            internal letterboxing. */}
      <div className="absolute inset-0 overflow-hidden" style={{ clipPath: thumbClip }}>
        {hasThumb ? (
          <img
            src={thumbUrl}
            alt=""
            loading="lazy"
            draggable={false}
            className="h-full w-full object-cover object-center"
          />
        ) : (
          <div className="grid h-full w-full place-items-center text-muted-foreground/40">
            <HugeiconsIcon icon={Image01Icon} strokeWidth={1.4} className="size-10" />
          </div>
        )}
      </div>

      {/* 4. Stroke pass — drawn last so the outline crisply sits on top
            of the thumbnail. Includes the diagonal fold edge. */}
      <svg
        viewBox="0 0 200 150"
        preserveAspectRatio="none"
        className="pointer-events-none absolute inset-0 h-full w-full overflow-visible"
        role="presentation"
      >
        <title>Scene outline</title>
        <path
          d={sheetPath}
          fill="none"
          stroke="var(--color-card-stroke)"
          strokeWidth="1.4"
          strokeLinejoin="round"
        />
        {/* Fold crease (the inside-edge where the corner is folded). */}
        <path
          d={`M ${200 - FOLD} 0 L ${200 - FOLD} ${FOLD} L 200 ${FOLD}`}
          fill="none"
          stroke="var(--color-card-stroke)"
          strokeWidth="1.2"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}

/** Convenience icon for a "more actions" trigger. */
export function SceneCardActionsIcon() {
  return <HugeiconsIcon icon={MoreHorizontalIcon} strokeWidth={2} />;
}
