// InkwellMark — the brand mark, as an inline SVG component.
//
// A monochrome "ink on paper" glyph: a folder outline with a single
// hand-drawn sketch stroke inside. The stroke colour comes from
// `currentColor`, so the mark inherits whichever text colour the
// surrounding context uses (foreground on the topbar, muted-foreground
// inside loading splashes, etc.).
//
// The standalone favicon at `public/favicon.svg` mirrors this geometry
// — keep the two path strings in sync if you tweak the silhouette.
//
// The `animate` prop turns on a continuous "draw → hold → erase" loop
// on the inner sketch stroke, used by the boot splash and the editor
// loading state in place of a generic spinner. The animation is driven
// entirely from CSS (see `.ink-sketch-anim` in `src/index.css`) and
// honours `prefers-reduced-motion`.

import type { SVGProps } from "react";

import { cn } from "@/lib/utils";

interface InkwellMarkProps extends Omit<SVGProps<SVGSVGElement>, "viewBox" | "fill"> {
  /** When true, the inner sketch stroke draws and erases on a loop. */
  animate?: boolean;
  /** Optional accessible label. When omitted, the mark is `aria-hidden`. */
  title?: string;
}

export function InkwellMark({ className, animate = false, title, ...rest }: InkwellMarkProps) {
  const labelled = Boolean(title);
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 64 64"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      role={labelled ? "img" : "presentation"}
      aria-hidden={labelled ? undefined : true}
      aria-label={labelled ? title : undefined}
      className={cn("size-6", className)}
      {...rest}
    >
      {labelled ? <title>{title}</title> : null}
      {/* Folder outline with a notched tab on the upper left. */}
      <path
        d="M14 12 L26 12 L32 20 L50 20 Q56 20 56 26 L56 50 Q56 56 50 56 L14 56 Q8 56 8 50 L8 18 Q8 12 14 12 Z"
        strokeWidth={5}
      />
      {/* Hand-drawn sketch stroke inside.
          `pathLength={1}` normalises the geometric length to 1 so the
          `.ink-sketch-anim` CSS can use stroke-dasharray/-offset values
          in the 0..1 range regardless of viewBox tweaks. */}
      <path
        d="M16 44 C22 32 28 32 30 40 C32 46 38 28 44 38"
        strokeWidth={4}
        pathLength={1}
        className={animate ? "ink-sketch-anim" : undefined}
      />
    </svg>
  );
}
