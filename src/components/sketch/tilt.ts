// Deterministic per-id tilt. Same id → same angle, every render.
// Used to give folders/files a tiny resting rotation without making the
// dashboard flicker on re-mount.
//
// Reserve for content artifacts only (file cards, folder cards, tape
// chips). Chrome must not tilt — controls and navigation read as
// broken when they wobble.

import { hashSeed } from "@/components/rough/useRoughPath";

/**
 * Returns a stable rotation angle in degrees for a given id, in
 * `[-max, max]`. Default max is 1°; in practice content cards use 0.4°
 * and tape chips use 0.8° — enough to feel hand-laid, restrained
 * enough not to hurt scannability when many items stack up.
 */
export function tiltFromId(id: string, max = 1): number {
  // Fold the 32-bit hash to a float in [-1, 1).
  const h = hashSeed(id);
  const norm = ((h & 0xffff) / 0xffff) * 2 - 1;
  return norm * max;
}

/**
 * Pick a deterministic item from a palette by id. Useful for tape-color
 * assignment that's stable per tag name.
 */
export function pickFromPalette<T>(id: string, palette: readonly T[]): T {
  const h = hashSeed(id);
  return palette[h % palette.length];
}
