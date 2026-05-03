// SceneCard — file-explorer tile for a scene.
//
// Visual: a sheet of paper with the top-right corner *torn off*. The
// card reads as paper, not a flat panel:
//
//   - Sheet body  → `--color-card` with a soft drop shadow lifting it
//                   off the desk, outlined with `--color-card-stroke`.
//                   The silhouette is a rectangle minus a jagged
//                   torn-off corner (see `tornCorner.ts`).
//   - Paper grain → `.bg-paper-grain` overlay (theme-aware multiply /
//                   screen blend) gives the surface its "tooth". The
//                   same utility powers `<PaperSurface>` so cards and
//                   the desk share visual vocabulary.
//   - Paper dots  → `.bg-paper-dots` adds discrete fibre specks on top
//                   of the grain for a recycled / kraft-paper feel.
//   - Back stack  → two extra sheets that fan out from behind on hover,
//                   each torn with the SAME tear polygon as the front
//                   so the stack reads as "a notepad torn through"
//                   rather than three independently-torn pages.
//
// Geometry: a single torn-corner polygon (deterministic per scene id)
// drives both the rough.js silhouette and the `clip-path` of the HTML
// overlays. The thumbnail therefore stops cleanly at the torn edge —
// nothing peeks past the silhouette.
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
import { type Ref, useMemo } from "react";

import { useRoughPath } from "@/components/rough";
import { cn } from "@/lib/utils";

import { tiltFromId } from "./tilt";
import { buildTornCorner } from "./tornCorner";

// Front-sheet rendering size in viewBox px. Used by `useRoughPath` to
// generate per-card wobbly edges; the resulting <path>s are rendered in
// this coordinate space and stretched to fit via `preserveAspectRatio`.
const SHEET_W = 200;
const SHEET_H = 150;
// Back-stack inset (in viewBox px) on each side. The two sheets behind
// the front sit inset by this much so at rest they hide behind it; on
// hover they fan out via the `.ink-scene__back--*` CSS rules.
const BACK_INSET = 8;

export interface SceneCardProps {
  id: string;
  name: string;
  hasThumb: boolean;
  thumbUrl: string;
  /** Parent folder name. Currently unused in the visual (Recent shows
   *  it in the right-click menu) but kept on the prop for future use. */
  folderName?: string | null;
  updatedAtLabel: string;
  /** Scene tags are still passed through from list data, but are not shown on the card. */
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
        <SceneGlyph id={id} hasThumb={hasThumb} thumbUrl={thumbUrl} />

        <div className="w-full min-w-0 text-center">
          <div className="truncate font-heading text-sm text-foreground" title={name}>
            {name}
          </div>
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
 * Paper-sheet silhouette with a torn top-right corner, plus two
 * stacked sheets behind that fan out on hover. The torn polygon is
 * shared by all three sheets so they look like a notepad torn
 * through (not three pages with independent rips).
 *
 * Layer order (back → front):
 *   1. Back-stack sheets  (SVG <path> using torn shape, inset 8px,
 *                          hidden at rest, fanned on hover)
 *   2. Front sheet fill+outline (rough.js around the torn polygon,
 *                                 CSS drop-shadow lifts it off the desk)
 *   3. Thumbnail          (HTML <img>, clip-path = torn polygon)
 *   4. Paper grain        (div, .bg-paper-grain, multiply/screen blend,
 *                          clip-path = torn polygon)
 *   5. Paper-fibre dots   (div, .bg-paper-dots, multiply/screen blend,
 *                          clip-path = torn polygon)
 */
function SceneGlyph({
  id,
  hasThumb,
  thumbUrl,
}: {
  id: string;
  hasThumb: boolean;
  thumbUrl: string;
}) {
  // Torn-corner geometry. Computed once per scene id; both `pathD`
  // (viewBox units, fed to rough.js + back-stack <path>s) and
  // `clipPolygon` (CSS percentages, applied to HTML overlays) are
  // derived from the same vertex list so the silhouette and clip
  // always agree.
  const torn = useMemo(
    () =>
      buildTornCorner({
        width: SHEET_W,
        height: SHEET_H,
        seed: `scene-tear:${id}`,
      }),
    [id],
  );

  // The back-stack sheets sit inset by `BACK_INSET` on every side. We
  // reuse the same torn vertex list, but scaled to fit the inset box
  // and translated by (BACK_INSET, BACK_INSET). Doing this via an SVG
  // `transform` on the <path> would also scale the visible stroke
  // weight, so we compensate by dividing the stroke width by the
  // smaller scale factor.
  const backSx = (SHEET_W - 2 * BACK_INSET) / SHEET_W;
  const backSy = (SHEET_H - 2 * BACK_INSET) / SHEET_H;
  const backStroke = 1.2 / Math.min(backSx, backSy);

  // Hand-drawn front-sheet paths from rough.js, drawn around the torn
  // polygon. Low roughness keeps the wobble subtle (~1 viewBox-px) so
  // the tear stays readable as a clean shape with paper-fibre fuzz,
  // not a chaotic scribble.
  const paperPaths = useRoughPath({
    width: SHEET_W,
    height: SHEET_H,
    shape: "custom",
    customPathD: torn.pathD,
    seed: `scene-paper:${id}`,
    stroke: "var(--color-card-stroke)",
    strokeWidth: 1.3,
    fill: "var(--color-card)",
    fillStyle: "solid",
    roughness: 0.6,
    bowing: 0.4,
  });

  return (
    <div className="relative w-full" style={{ aspectRatio: "4 / 3" }} aria-hidden>
      {/* 1. Back stack — two sheets that fan out on hover. Inset on
            every side from the front sheet so at rest they hide
            *behind* the front silhouette, and on hover peek out from
            behind (not beyond) the front. They share the front's
            torn polygon so the tear cascades through the stack. */}
      <svg
        viewBox={`0 0 ${SHEET_W} ${SHEET_H}`}
        preserveAspectRatio="none"
        className="absolute inset-0 h-full w-full overflow-visible"
        role="presentation"
      >
        <title>Scene back stack</title>
        <g transform={`translate(${BACK_INSET} ${BACK_INSET}) scale(${backSx} ${backSy})`}>
          <path
            className="ink-scene__back ink-scene__back--l"
            d={torn.pathD}
            fill="var(--color-card)"
            stroke="var(--color-card-stroke)"
            strokeOpacity="0.55"
            strokeWidth={backStroke}
            strokeLinejoin="round"
          />
          <path
            className="ink-scene__back ink-scene__back--r"
            d={torn.pathD}
            fill="var(--color-card)"
            stroke="var(--color-card-stroke)"
            strokeOpacity="0.55"
            strokeWidth={backStroke}
            strokeLinejoin="round"
          />
        </g>
      </svg>

      {/* 2. Front sheet — hand-drawn fill + outline from rough.js,
            drawn around the torn polygon. CSS drop-shadow lifts it
            off the desk (a tight contact shadow + a soft ambient one
            read in both light and dark themes). The drop-shadow
            filter follows the actual rendered alpha, so the tear
            casts a tear-shaped shadow — not a clean rectangle. */}
      <svg
        viewBox={`0 0 ${SHEET_W} ${SHEET_H}`}
        preserveAspectRatio="none"
        className="absolute inset-0 h-full w-full overflow-visible"
        style={{
          filter:
            "drop-shadow(0 1px 1.5px rgba(0,0,0,0.22)) drop-shadow(0 6px 10px rgba(0,0,0,0.16))",
        }}
        role="presentation"
      >
        <title>Scene paper</title>
        {paperPaths.map((p) => (
          <path
            key={`${p.stroke ?? ""}|${p.fill ?? ""}|${p.d}`}
            d={p.d}
            stroke={p.stroke}
            strokeWidth={p.strokeWidth}
            fill={p.fill ?? "none"}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}
      </svg>

      {/* 3. Thumbnail clipped to the torn silhouette. No inset — we
            *want* the image to bleed all the way to the torn edge so
            the tear doesn't reveal a clean rectangle hidden under it. */}
      <div
        className="absolute inset-0 overflow-hidden"
        style={{ clipPath: torn.clipPolygon }}
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

      {/* 4. Paper grain — fine tooth, reuses the utility from
            <PaperSurface>. Mix-blend-mode in the class flips per theme. */}
      <div
        aria-hidden
        className="bg-paper-grain pointer-events-none absolute inset-0"
        style={{ clipPath: torn.clipPolygon }}
      />

      {/* 5. Paper-fibre dots — sparse, larger specks that read as
            recycled / kraft paper inclusions. Stacked on top of grain. */}
      <div
        aria-hidden
        className="bg-paper-dots pointer-events-none absolute inset-0"
        style={{ clipPath: torn.clipPolygon }}
      />
    </div>
  );
}

/** Convenience icon for a "more actions" trigger. */
export function SceneCardActionsIcon() {
  return <HugeiconsIcon icon={MoreHorizontalIcon} strokeWidth={2} />;
}
