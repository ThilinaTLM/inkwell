// fileKindChip — derive a tiny coloured chip for a static-site asset
// based on its file extension.
//
// The static-site editor renders one chip per file in the bundle so
// users can scan-spot the HTML pages, the stylesheet, the script, the
// images at a glance instead of having to read ten near-identical
// monospace strings. Colours come from the existing `--color-tag-1..5`
// swatches (already theme-aware in `src/index.css`), plus the
// static-site kind accent and muted neutrals as fallbacks so we never
// run out of slots.
//
// Chip foregrounds use `--color-card`, which inverts with the theme:
// white on the saturated light-theme swatches, near-black on the
// lighter dark-theme swatches.
//
// Pure module — no React. Consumed by `FileRow.tsx`.

export type AssetKind = "html" | "css" | "js" | "image" | "font" | "json" | "doc" | "other";

export interface KindDescriptor {
  /** Long label, used as accessible name + tooltip. */
  label: string;
  /** Two-character abbreviation rendered inside the chip. */
  abbr: string;
  /** CSS color expression (token reference). */
  color: string;
  /** Foreground color used by the abbreviation. */
  fg: string;
}

const TABLE: Record<AssetKind, KindDescriptor> = {
  // Pink — HTML pages are the "content" of a static site, the loudest
  // slot is intentional.
  html: {
    label: "HTML page",
    abbr: "HT",
    color: "var(--color-tag-2)",
    fg: "var(--color-card)",
  },
  // Blue — stylesheets.
  css: {
    label: "Stylesheet",
    abbr: "CS",
    color: "var(--color-tag-4)",
    fg: "var(--color-card)",
  },
  // Yellow — scripts.
  js: {
    label: "Script",
    abbr: "JS",
    color: "var(--color-tag-1)",
    fg: "var(--color-card)",
  },
  // Green — images / vector assets.
  image: {
    label: "Image",
    abbr: "IM",
    color: "var(--color-tag-3)",
    fg: "var(--color-card)",
  },
  // Purple — fonts.
  font: {
    label: "Font",
    abbr: "FN",
    color: "var(--color-tag-5)",
    fg: "var(--color-card)",
  },
  // Blue-grey — data / source-maps. Reuses the static-site kind accent
  // so data files sit visually next to the site card.
  json: {
    label: "Data",
    abbr: "JN",
    color: "var(--color-kind-static)",
    fg: "var(--color-card)",
  },
  // Muted — documents (pdf / md / txt).
  doc: {
    label: "Document",
    abbr: "DC",
    color: "var(--color-muted)",
    fg: "var(--color-muted-foreground)",
  },
  // Muted — fallback for anything unrecognised. Two dots so it reads
  // as "something" rather than a missing label.
  other: {
    label: "File",
    abbr: "··",
    color: "var(--color-muted)",
    fg: "var(--color-muted-foreground)",
  },
};

/** Map a file path to its asset kind by extension. Lowercased; the
 *  extension is whatever follows the last `.` in the path (case-
 *  insensitive). Unknown extensions return `"other"`. */
export function kindForPath(path: string): AssetKind {
  const lower = path.toLowerCase();
  const dot = lower.lastIndexOf(".");
  const ext = dot === -1 ? "" : lower.slice(dot + 1);
  switch (ext) {
    case "html":
    case "htm":
    case "xhtml":
      return "html";
    case "css":
      return "css";
    case "js":
    case "mjs":
    case "cjs":
    case "ts":
    case "tsx":
    case "jsx":
      return "js";
    case "png":
    case "jpg":
    case "jpeg":
    case "gif":
    case "webp":
    case "svg":
    case "avif":
    case "ico":
    case "bmp":
      return "image";
    case "woff":
    case "woff2":
    case "ttf":
    case "otf":
    case "eot":
      return "font";
    case "json":
    case "map":
    case "xml":
    case "yaml":
    case "yml":
    case "toml":
      return "json";
    case "pdf":
    case "md":
    case "markdown":
    case "txt":
      return "doc";
    default:
      return "other";
  }
}

/** Lookup the chip descriptor for a path in one call. */
export function chipForPath(path: string): KindDescriptor {
  return TABLE[kindForPath(path)];
}
