// useRoughPath — turns a shape spec into rough.js-rendered SVG path data.
//
// We use the *generator* API (no canvas, no DOM) and call `toPaths()` to get
// a list of `{ d, stroke, strokeWidth, fill? }` records that render as plain
// `<path>` children inside an SVG. Result is memoized on the full input
// signature so re-renders never recompute.
//
// Shapes (`shape` prop):
//   rect         — straight rectangle
//   rounded      — rectangle with corner radius (path with arc commands)
//   card         — same as rounded but defaults to a softer radius
//   folder-tab   — manila-folder silhouette: notched tab top-left + body
//   paper-sheet  — rectangle with the top-right corner cut diagonally
//                  (paper with a folded corner)
//   custom       — caller supplies an explicit `customPathD` SVG `d`
//                  string. Used by SceneCard for its torn-corner
//                  silhouette, where the geometry is computed outside
//                  this hook (see `tornCorner.ts`).
//
// `seed` is a string (typically an entity id) hashed to a stable 32-bit int
// so the wobble of a given folder/scene never reshuffles between renders.

import { useMemo } from "react";
import type { Options, PathInfo } from "roughjs/bin/core";
import type { RoughGenerator } from "roughjs/bin/generator";
// @ts-expect-error — roughjs ships ESM but no .d.ts for the bundled path
import rough from "roughjs/bundled/rough.esm.js";

export type RoughShape = "rect" | "rounded" | "card" | "folder-tab" | "paper-sheet" | "custom";

export interface RoughPathSpec {
  width: number;
  height: number;
  shape: RoughShape;
  seed: string;
  /** Corner radius for `rounded` / `card`. Default 12. */
  radius?: number;
  /** Folder tab width as a fraction of total width (0..1). Default 0.34. */
  tabWidth?: number;
  /** Folder tab height in pixels. Default 22. */
  tabHeight?: number;
  /** Folder tab slope (px) — diagonal between tab and body. Default 10. */
  tabSlope?: number;
  /** `paper-sheet`: corner-fold size in pixels. Default 14. */
  cornerFold?: number;
  /**
   * `custom`: explicit SVG path `d` string. Required when
   * `shape === "custom"`; ignored otherwise. Coordinates are in the
   * same `width × height` viewBox as the other shapes, so callers
   * can mix custom silhouettes with the built-in ones.
   */
  customPathD?: string;
  /** Stroke color. */
  stroke: string;
  /** Stroke width in pixels. Default 1.6. */
  strokeWidth?: number;
  /** Optional fill color. */
  fill?: string;
  /** Roughness 0..3. Lower is cleaner. Default 1.1. */
  roughness?: number;
  /** Bowing of straight lines. Default 1. */
  bowing?: number;
  /** Fill style: hachure | solid | zigzag | cross-hatch | dots | dashed. Default solid. */
  fillStyle?: string;
}

/**
 * Hash a string to a positive 32-bit integer (FNV-1a).
 * Deterministic — same input always yields the same output.
 */
export function hashSeed(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

interface BuildPathDArgs {
  shape: RoughPathSpec["shape"];
  width: number;
  height: number;
  radius?: number;
  cornerFold?: number;
  tabWidth?: number;
  tabHeight?: number;
  tabSlope?: number;
  customPathD?: string;
}

function buildPathD(args: BuildPathDArgs): string {
  const { shape, width: w, height: h } = args;
  const r = Math.max(0, Math.min(args.radius ?? 12, w / 2, h / 2));

  if (shape === "rect") {
    return `M0,0 L${w},0 L${w},${h} L0,${h} Z`;
  }

  if (shape === "rounded" || shape === "card") {
    const radius = shape === "card" ? Math.min(args.radius ?? 14, w / 2, h / 2) : r;
    return [
      `M${radius},0`,
      `L${w - radius},0`,
      `A${radius},${radius} 0 0 1 ${w},${radius}`,
      `L${w},${h - radius}`,
      `A${radius},${radius} 0 0 1 ${w - radius},${h}`,
      `L${radius},${h}`,
      `A${radius},${radius} 0 0 1 0,${h - radius}`,
      `L0,${radius}`,
      `A${radius},${radius} 0 0 1 ${radius},0`,
      `Z`,
    ].join(" ");
  }

  if (shape === "paper-sheet") {
    const c = Math.max(0, Math.min(args.cornerFold ?? 14, w / 2, h / 2));
    return [`M0,0`, `L${w - c},0`, `L${w},${c}`, `L${w},${h}`, `L0,${h}`, `Z`].join(" ");
  }

  if (shape === "custom") {
    // Caller is responsible for closing the path. Empty string is a
    // valid no-op (rough.js will produce no drawables).
    return args.customPathD ?? "";
  }

  // folder-tab
  const tw = (args.tabWidth ?? 0.34) * w;
  const th = args.tabHeight ?? 22;
  const ts = args.tabSlope ?? 10;
  return [
    `M0,${th}`,
    `L0,0`,
    `L${tw},0`,
    `L${tw + ts},${th}`,
    `L${w},${th}`,
    `L${w},${h}`,
    `L0,${h}`,
    `Z`,
  ].join(" ");
}

let _generator: RoughGenerator | null = null;
function generator(): RoughGenerator {
  if (!_generator) _generator = rough.generator() as RoughGenerator;
  return _generator;
}

/**
 * Compute rough.js-rendered SVG paths for a shape. Memoized by all inputs;
 * the work runs once per unique (seed, shape, w, h, stroke...).
 */
export function useRoughPath(spec: RoughPathSpec): PathInfo[] {
  const {
    width,
    height,
    shape,
    seed,
    radius,
    tabWidth,
    tabHeight,
    tabSlope,
    cornerFold,
    customPathD,
    stroke,
    strokeWidth,
    fill,
    roughness,
    bowing,
    fillStyle,
  } = spec;

  return useMemo(() => {
    if (width <= 0 || height <= 0) return [];
    const opts: Options = {
      seed: hashSeed(seed),
      roughness: roughness ?? 1.1,
      bowing: bowing ?? 1,
      stroke,
      strokeWidth: strokeWidth ?? 1.6,
      fill,
      fillStyle: fillStyle ?? "solid",
      // fillWeight only matters for hachure; safe default
      fillWeight: 1.4,
      preserveVertices: true,
      disableMultiStroke: false,
    };
    const d = buildPathD({
      shape,
      width,
      height,
      radius,
      cornerFold,
      tabWidth,
      tabHeight,
      tabSlope,
      customPathD,
    });
    const drawable = generator().path(d, opts);
    return generator().toPaths(drawable);
  }, [
    width,
    height,
    shape,
    seed,
    radius,
    tabWidth,
    tabHeight,
    tabSlope,
    cornerFold,
    customPathD,
    stroke,
    strokeWidth,
    fill,
    roughness,
    bowing,
    fillStyle,
  ]);
}
