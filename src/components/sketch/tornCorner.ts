// tornCorner — geometry for a "ripped paper" silhouette.
//
// Builds a single closed polygon shaped like a rectangle whose top-right
// corner has been torn off along a jagged line. Same vertex list is
// emitted twice:
//   - `pathD`        — SVG `d` attribute in viewBox units (W × H), used
//                       both as the rough.js silhouette source AND as
//                       the geometry the back-stack <path>s draw.
//   - `clipPolygon`  — CSS `clip-path: polygon(...)` (percentages), used
//                       on HTML overlays (thumbnail / paper-grain /
//                       paper-dots) so they stop at the torn edge.
//
// The tear is deterministic per `seed` (typically a scene id), built
// from a small mulberry32 PRNG seeded by the same FNV-1a hash that
// `useRoughPath` uses, so the wobbly outline and the tear stay in sync
// on re-render.
//
// Geometry (looking at the rectangle, top-right is torn):
//
//     (0,0) ────────── (xStart,0)
//        │                  \\
//        │                   ··jagged··
//        │                          \\
//        │                       (W, yEnd)
//        │                            │
//     (0,H) ─────────────────────── (W,H)
//
// `xStart` and `yEnd` are placed `size` (a fraction of the shorter side)
// in from the top-right corner. The jagged segments run from
// `(xStart, 0)` to `(W, yEnd)` with each midpoint pushed perpendicular
// to that diagonal by `±jitter * size * shorterSide`, giving the tear
// fibre-edge irregularity without crossing back over itself.

import { hashSeed } from "@/components/rough/useRoughPath";

export interface TornCornerOpts {
  /** Reference width (viewBox units). The `pathD` is in these units. */
  width: number;
  /** Reference height (viewBox units). The `pathD` is in these units. */
  height: number;
  /**
   * Tear "depth" as a fraction of the shorter axis. Default 0.18 — the
   * tear nibbles ~18% off each adjacent edge, similar in scale to the
   * old 24-px dog-ear on a 200×150 viewBox.
   */
  size?: number;
  /**
   * Number of zigzag segments between the tear's start and end. Default
   * 7 — enough to read as fibre, few enough to stay tidy at small card
   * sizes.
   */
  steps?: number;
  /**
   * Per-vertex perpendicular jitter as a fraction of `size`. Default
   * 0.4 — moderately ragged. Higher values look more shredded.
   */
  jitter?: number;
  /**
   * Per-vertex longitudinal jitter as a fraction of one segment length.
   * Default 0.25 — adds slight irregularity in step spacing so the
   * zigzag doesn't read as evenly-rhythmic teeth.
   */
  jitterAlong?: number;
  /** Stable seed (e.g. file id). Same seed → same tear. */
  seed: string;
}

export interface TornCornerResult {
  /** SVG path data in `width × height` units, includes the closing `Z`. */
  pathD: string;
  /**
   * CSS clip-path value (`polygon(x% y%, ...)`), suitable for the
   * `clip-path` style on HTML elements regardless of their pixel size.
   */
  clipPolygon: string;
}

/** Tiny seedable PRNG. Same algorithm as the canonical mulberry32. */
function mulberry32(seedInt: number): () => number {
  let t = seedInt >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = t;
    r = Math.imul(r ^ (r >>> 15), r | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

/** Linear interpolation between two scalars. */
function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Clamp `v` into the inclusive range `[lo, hi]`. */
function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/**
 * Build a torn-corner silhouette. Pure / deterministic per `seed`.
 *
 * The returned polygon walks counter-clockwise:
 *   top-left → top edge → tear (zigzag) → right edge → bottom-right
 *   → bottom-left → close.
 */
export function buildTornCorner(opts: TornCornerOpts): TornCornerResult {
  const W = opts.width;
  const H = opts.height;
  const size = opts.size ?? 0.18;
  const steps = Math.max(3, opts.steps ?? 7);
  const jitter = opts.jitter ?? 0.4;
  const jitterAlong = opts.jitterAlong ?? 0.25;
  const shorter = Math.min(W, H);

  // Where the tear meets the top edge and the right edge.
  const xStart = (1 - size) * W;
  const yEnd = size * H;

  // Diagonal from (xStart, 0) → (W, yEnd). We jitter each interior
  // vertex perpendicular to this direction, so the tear hugs the
  // diagonal but reads as irregular paper fibre.
  const dx = W - xStart;
  const dy = yEnd - 0;
  const diagLen = Math.hypot(dx, dy);
  // Unit perpendicular pointing AWAY from the corner that was torn off
  // (i.e. into the remaining paper). For (dx>0, dy>0) the inward
  // perpendicular is (-dy, dx) normalized — pushing vertices toward
  // the page interior bites *into* the paper, which is what we want.
  const perpX = -dy / diagLen;
  const perpY = dx / diagLen;

  const rand = mulberry32(hashSeed(`tear:${opts.seed}`));
  // Symmetric jitter in [-1, 1].
  const jit = () => rand() * 2 - 1;

  const maxPerp = jitter * size * shorter;
  // One nominal segment along the diagonal.
  const segLen = diagLen / steps;
  const maxAlong = jitterAlong * segLen;

  // Build interior tear vertices. We generate (steps - 1) interior
  // points; the start (xStart, 0) and end (W, yEnd) are added separately
  // and stay anchored to their edges so the tear meets the rectangle
  // cleanly (no gap or overshoot).
  const interior: Array<[number, number]> = [];
  for (let i = 1; i < steps; i++) {
    const tBase = i / steps;
    // Longitudinal jitter — keep first/last interior point closer to
    // their neighbours so the tear doesn't bunch up at the ends.
    const tJit = (jit() * maxAlong) / diagLen;
    const t = clamp(tBase + tJit, 0.05, 0.95);

    // Base point on the diagonal.
    const baseX = lerp(xStart, W, t);
    const baseY = lerp(0, yEnd, t);

    // Perpendicular offset, into the paper interior.
    const offset = jit() * maxPerp;
    const px = baseX + perpX * offset;
    const py = baseY + perpY * offset;

    // Clamp inside the rectangle so we never poke outside the sheet.
    interior.push([clamp(px, 0, W), clamp(py, 0, H)]);
  }

  // Full vertex list, counter-clockwise starting at top-left.
  const points: Array<[number, number]> = [
    [0, 0],
    [xStart, 0],
    ...interior,
    [W, yEnd],
    [W, H],
    [0, H],
  ];

  // Format SVG path `d` in viewBox units. Two decimal places is plenty
  // — sub-pixel accuracy at this scale is invisible.
  const fmt = (n: number) => (Math.round(n * 100) / 100).toString();
  const pathD = `${points.map((p, i) => `${i === 0 ? "M" : "L"}${fmt(p[0])},${fmt(p[1])}`).join(" ")} Z`;

  // Format CSS clip-path polygon as percentages.
  // Two-decimal percentage so the polygon rounds cleanly at any DPR.
  const fmtPct = (n: number) => `${(Math.round(n * 10000) / 100).toString()}%`;
  const clipPolygon = `polygon(${points.map((p) => `${fmtPct(p[0] / W)} ${fmtPct(p[1] / H)}`).join(", ")})`;

  return { pathD, clipPolygon };
}
