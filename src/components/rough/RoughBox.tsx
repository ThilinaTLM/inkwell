// RoughBox — a sketchbook-style SVG silhouette rendered behind a content
// container. Sits in `absolute inset-0` so the consumer can layer text /
// children on top with normal flex/grid layout.
//
// Sizes itself to the parent box via ResizeObserver; recomputes the rough
// path only when (width, height, shape, seed, …) actually change.

import { useEffect, useRef, useState } from "react";
import { type RoughPathSpec, type RoughShape, useRoughPath } from "./useRoughPath";

export interface RoughBoxProps extends Omit<RoughPathSpec, "width" | "height" | "shape"> {
  /** Pass an explicit shape (default `rounded`). */
  shape?: RoughShape;
  /** Optional className applied to the wrapping `<svg>`. */
  className?: string;
  /**
   * If true the SVG is positioned `absolute inset-0` and the consumer is
   * expected to render content on top. Default `true`.
   */
  absolute?: boolean;
  /** Override the SVG `aria-hidden`. Default `true` (decorative). */
  ariaHidden?: boolean;
}

export function RoughBox({
  shape = "rounded",
  className,
  absolute = true,
  ariaHidden = true,
  ...spec
}: RoughBoxProps) {
  const ref = useRef<SVGSVGElement | null>(null);
  const [size, setSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const cr = entries[0]?.contentRect;
      if (!cr) return;
      const w = Math.round(cr.width);
      const h = Math.round(cr.height);
      setSize((prev) => (prev.w === w && prev.h === h ? prev : { w, h }));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const paths = useRoughPath({ ...spec, shape, width: size.w, height: size.h });

  return (
    <svg
      ref={ref}
      className={className}
      aria-hidden={ariaHidden}
      role={ariaHidden ? "presentation" : "img"}
      style={
        absolute
          ? {
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              pointerEvents: "none",
              overflow: "visible",
            }
          : { width: "100%", height: "100%", overflow: "visible" }
      }
      viewBox={size.w > 0 && size.h > 0 ? `0 0 ${size.w} ${size.h}` : undefined}
      preserveAspectRatio="none"
    >
      <title>{`Decorative ${shape} shape`}</title>
      {paths.map((p) => (
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
  );
}
