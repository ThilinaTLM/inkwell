// SceneCard — file-explorer tile for a scene.
//
// Visual: a sheet of paper with an opaque dog-ear in the top-right
// corner. The card reads as paper, not a flat panel:
//
//   - Sheet body  → `--color-card` with a soft drop shadow lifting it
//                   off the desk, outlined with `--color-card-stroke`
//   - Paper grain → `.bg-paper-grain` overlay (theme-aware multiply /
//                   screen blend) gives the surface its "tooth". The
//                   same utility powers `<PaperSurface>` so cards and
//                   the desk share visual vocabulary.
//   - Dog-ear     → a card-tinted triangular flap (color-mixed toward
//                   `--color-foreground`) so it reads as the same
//                   paper, just shaded. A small offset shadow behind
//                   the flap and a crease stroke sell the fold.
//   - Back stack  → two extra sheets that fan out from behind on hover,
//                   suggesting "this scene has more inside".
//
// Geometry: the front sheet is a rounded rectangle covering the full
// 200×150 viewBox. The thumbnail fills the same rectangle (clipped to
// matching rounded corners). The dog-ear is the LAST layer painted, so
// the thumbnail is hidden under it without any path-cutting trickery.
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

// Dog-ear size in viewBox px (12% of 200 wide).
const FOLD = 24;
// Sheet path — rounded rectangle, full viewBox, 3px corner radius.
const SHEET_PATH =
  "M 0 3 Q 0 0 3 0 L 197 0 Q 200 0 200 3 L 200 147 Q 200 150 197 150 L 3 150 Q 0 150 0 147 Z";

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
 * Paper-sheet silhouette with an opaque dog-ear corner overlay, plus
 * two stacked sheets behind that fan out on hover.
 *
 * Layer order (back → front):
 *   1. Back-stack sheets  (SVG, hidden at rest, inset 8px from front)
 *   2. Front sheet fill   (SVG, rounded rect, with CSS drop-shadow
 *                          lifting it off the desk)
 *   3. Thumbnail          (HTML <img>, rounded-rect clip)
 *   4. Paper grain        (div, .bg-paper-grain, multiply/screen blend)
 *   5. Front sheet stroke (SVG, drawn over the thumbnail)
 *   6. Dog-ear overlay    (SVG: shadow + tinted flap + crease)
 */
function SceneGlyph({ hasThumb, thumbUrl }: { hasThumb: boolean; thumbUrl: string }) {
  // Card-tinted flap colour: the page hue mixed 22% toward the
  // foreground so the flap reads as the *same* paper, just shaded.
  // Symmetric across themes — in light it goes warm-gray, in dark it
  // lifts slightly toward cream, both feeling like a folded paper edge
  // rather than a separate-coloured sticker.
  const foldFill = "color-mix(in srgb, var(--color-card) 78%, var(--color-foreground))";

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

      {/* 2. Front sheet fill — a rounded rectangle with a soft drop
            shadow so the page lifts off the desk. Two stacked shadows
            (a tight contact shadow + a soft ambient one) read in both
            light and dark themes. Drawn under the thumbnail so the
            page is opaque even with no image. */}
      <svg
        viewBox="0 0 200 150"
        preserveAspectRatio="none"
        className="absolute inset-0 h-full w-full overflow-visible"
        style={{
          filter:
            "drop-shadow(0 1px 1.5px rgba(0,0,0,0.22)) drop-shadow(0 6px 10px rgba(0,0,0,0.16))",
        }}
        role="presentation"
      >
        <title>Scene paper</title>
        <path d={SHEET_PATH} fill="var(--color-card)" />
      </svg>

      {/* 3. Thumbnail filling the full rectangle. The dog-ear in step 6
            paints over its top-right corner. Rounded-rect clip keeps
            the thumbnail edges aligned with the sheet outline. */}
      <div
        className="absolute inset-0 overflow-hidden"
        style={{ clipPath: "inset(0 round 3px)" }}
      >
        {hasThumb ? (
          <img
            src={thumbUrl}
            alt=""
            loading="lazy"
            draggable={false}
            className="ink-thumb-img h-full w-full object-cover object-center"
          />
        ) : (
          <div className="grid h-full w-full place-items-center text-muted-foreground/40">
            <HugeiconsIcon icon={Image01Icon} strokeWidth={1.4} className="size-10" />
          </div>
        )}
      </div>

      {/* 4. Paper grain — reuses the same SVG-noise utility powering
            <PaperSurface>. Sits between the thumbnail and the outline
            so the texture lays gently over both the empty page area
            and the strokes inside the thumbnail. Mix-blend-mode in the
            utility flips multiply/screen per theme so it darkens light
            paper and lightens dark paper. */}
      <div
        aria-hidden
        className="bg-paper-grain pointer-events-none absolute inset-0"
        style={{ clipPath: "inset(0 round 3px)" }}
      />

      {/* 5. Sheet outline — drawn over the grain so the rounded-rect
            edge stays crisp regardless of thumbnail content. */}
      <svg
        viewBox="0 0 200 150"
        preserveAspectRatio="none"
        className="pointer-events-none absolute inset-0 h-full w-full overflow-visible"
        role="presentation"
      >
        <title>Scene outline</title>
        <path
          d={SHEET_PATH}
          fill="none"
          stroke="var(--color-card-stroke)"
          strokeWidth="1.4"
          strokeLinejoin="round"
        />
      </svg>

      {/* 6. Dog-ear overlay — painted last so it hides the thumbnail
            in the corner. Three sub-layers sell the fold:
              (a) shadow triangle: same flap shape, offset down-left so
                  a thin dark sliver leaks out at the crease edge,
                  reading as the lift cast by the corner;
              (b) flap: card-tinted (foldFill) so it's the same paper
                  in different light, not a coloured sticker;
              (c) crease stroke: the hypotenuse, in card-stroke. */}
      <svg
        viewBox="0 0 200 150"
        preserveAspectRatio="none"
        className="pointer-events-none absolute inset-0 h-full w-full overflow-visible"
        role="presentation"
      >
        <title>Dog-ear</title>
        <path
          d={`M ${200 - FOLD - 1.5} 1.5 L 200 1.5 L 200 ${FOLD + 1.5} Z`}
          fill="rgba(0, 0, 0, 0.22)"
        />
        <path
          d={`M ${200 - FOLD} 0 L 200 0 L 200 ${FOLD} Z`}
          fill={foldFill}
        />
        <path
          d={`M ${200 - FOLD} 0 L 200 ${FOLD}`}
          fill="none"
          stroke="var(--color-card-stroke)"
          strokeWidth="1.2"
          strokeLinecap="round"
          strokeOpacity="0.7"
        />
      </svg>
    </div>
  );
}

/** Convenience icon for a "more actions" trigger. */
export function SceneCardActionsIcon() {
  return <HugeiconsIcon icon={MoreHorizontalIcon} strokeWidth={2} />;
}
