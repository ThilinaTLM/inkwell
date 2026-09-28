// InkwellMark — the brand mark ("Well"), as an inline SVG component.
//
// A short, wide inkwell with a pen dipped in and burnt-orange ink inside.
// Strokes use `currentColor`, so the mark inherits the surrounding text
// colour. The ink uses `var(--primary)` (`tone="brand"`, the default) or
// `currentColor` (`tone="mono"`, for single-colour contexts).
//
// Geometry is shared with:
//   - public/favicon.svg                (theme-aware favicon)
//   - index.html `#boot-splash`          (pre-JS static splash)
//   - docs/brand/**                      (source artwork + brand sheet)
// Keep the path strings in sync if you tweak the silhouette.
//
// `animate` turns on the loading loop: the pen dips into the well and the
// ink surface ripples sideways. It replaces a generic spinner on the boot
// splash and editor loading states. The animation is CSS-only (see
// `.ink-pen-dip` / `.ink-wave` in `src/index.css`) and honours
// `prefers-reduced-motion`.

import { type SVGProps, useId } from "react";

import { cn } from "@/lib/utils";

/** Bottle outline: rim, neck, shoulders, body. 64×64 viewBox. */
export const WELL_BODY_PATH =
  "M23 17 H41 M27 17 V21 C27 25 9 26 9 36 V48 Q9 56 17 56 H47 Q55 56 55 48 V36 C55 26 37 25 37 21 V17";
/** The pen dipped into the neck. */
export const WELL_PEN_PATH = "M50 3 L35 22";
/** Static ink pool, one gentle wave. */
export const WELL_INK_PATH =
  "M9 43 C16 37 23 37 30 42 C37 47 46 47 55 40 V48 Q55 56 47 56 H17 Q9 56 9 48 Z";
/** Closed bottle interior, used to clip the animated wave. */
const WELL_CLIP_PATH =
  "M27 17 V21 C27 25 9 26 9 36 V48 Q9 56 17 56 H47 Q55 56 55 48 V36 C55 26 37 25 37 21 V17 Z";
/** A periodic wave (wavelength 48) wide enough to slide one period sideways. */
const WELL_WAVE_PATH = `M-48 43 q12 -7 24 0 ${"t24 0 ".repeat(6)}V64 H-48 Z`;

interface InkwellMarkProps extends Omit<SVGProps<SVGSVGElement>, "viewBox" | "fill"> {
  /** When true, the pen dips and the ink ripples on a loop. */
  animate?: boolean;
  /** `brand` fills the ink with the primary colour; `mono` uses currentColor. */
  tone?: "brand" | "mono";
  /** Optional accessible label. When omitted, the mark is `aria-hidden`. */
  title?: string;
}

export function InkwellMark({
  className,
  animate = false,
  tone = "brand",
  title,
  ...rest
}: InkwellMarkProps) {
  const clipId = useId();
  const labelled = Boolean(title);
  const inkFill = tone === "brand" ? "var(--primary)" : "currentColor";

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 64 64"
      fill="none"
      stroke="currentColor"
      strokeWidth={4}
      strokeLinecap="round"
      strokeLinejoin="round"
      role={labelled ? "img" : "presentation"}
      aria-hidden={labelled ? undefined : true}
      aria-label={labelled ? title : undefined}
      className={cn("size-6 shrink-0", className)}
      {...rest}
    >
      {labelled ? <title>{title}</title> : null}
      {animate ? (
        <>
          <defs>
            <clipPath id={clipId}>
              <path d={WELL_CLIP_PATH} />
            </clipPath>
          </defs>
          <g clipPath={`url(#${clipId})`}>
            <path className="ink-wave" d={WELL_WAVE_PATH} fill={inkFill} stroke="none" />
          </g>
        </>
      ) : (
        <path d={WELL_INK_PATH} fill={inkFill} stroke="none" />
      )}
      <path d={WELL_BODY_PATH} />
      <g className={animate ? "ink-pen-dip" : undefined}>
        <path d={WELL_PEN_PATH} />
      </g>
    </svg>
  );
}
