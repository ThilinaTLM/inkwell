// Pure naming helpers for uploads.

/** Longest name the worker accepts (it truncates at 200). */
export const MAX_NAME_LENGTH = 200;

const COMPOUND_EXTENSIONS = /\.(drawio\.xml|excalidraw\.json)$/i;

/** "Retro — sprint 14.md" → "Retro — sprint 14". Compound extensions
 *  such as `.drawio.xml` are stripped whole. A dot-file or empty stem
 *  falls back to `fallback`. */
export function stripExtension(filename: string, fallback = "Untitled"): string {
  const base = filename.split("/").pop() ?? filename;
  let stem = base.replace(COMPOUND_EXTENSIONS, "");
  if (stem === base) {
    const dot = base.lastIndexOf(".");
    stem = dot > 0 ? base.slice(0, dot) : base.startsWith(".") ? "" : base;
  }
  stem = stem.trim().slice(0, MAX_NAME_LENGTH);
  return stem || fallback;
}

/** Case-insensitive comparison key for names inside one folder. */
export function nameKey(name: string): string {
  return name.trim().toLocaleLowerCase();
}

/**
 * First free name of the form `base`, `base (2)`, `base (3)`… given the
 * names already taken in the folder (compared case-insensitively). An
 * existing ` (n)` suffix on `base` is continued rather than nested, so
 * "Plan (2)" becomes "Plan (3)", not "Plan (2) (2)".
 */
export function uniqueName(base: string, taken: Iterable<string>): string {
  const keys = new Set<string>();
  for (const t of taken) keys.add(nameKey(t));
  if (!keys.has(nameKey(base))) return base;

  const m = /^(.*) \((\d+)\)$/.exec(base);
  const stem = m ? m[1] : base;
  let n = m ? Number(m[2]) + 1 : 2;
  for (;;) {
    const suffix = ` (${n})`;
    const candidate = `${stem.slice(0, MAX_NAME_LENGTH - suffix.length)}${suffix}`;
    if (!keys.has(nameKey(candidate))) return candidate;
    n++;
  }
}
