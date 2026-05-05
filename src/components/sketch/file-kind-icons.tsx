// File-kind glyphs.
//
// Two surfaces, two variants of the same brand mark:
//
//   FileKindGlyph (variant="mark", default) — the colored mark on a
//     transparent background, sized for inline use next to text in
//     dropdown / context menus.
//
//   FileKindBadge — the full brand chip (colored rounded square +
//     mark) sized for the top-left of a file card. The brand square
//     itself is the chip; we layer only a subtle ring on top so the
//     white Excalidraw badge doesn't melt into a light-theme card.
//
// Source SVGs are inlined as React components in `./brand-logos`.

import type { FileKind } from "@/lib/api/client";
import { cn } from "@/lib/utils";
import { type BrandLogoVariant, DrawioLogo, ExcalidrawLogo } from "./brand-logos";

export type FileKindGlyphVariant = BrandLogoVariant;

/** Inline glyph for a given file kind.
 *  - `variant="mark"` (default): just the colored brand mark, defaults
 *    to `size-3.5` for inline-with-text use.
 *  - `variant="full"`: the full brand chip, sized to its container.
 */
export function FileKindGlyph({
  kind,
  variant = "mark",
  className,
}: {
  kind: FileKind;
  variant?: FileKindGlyphVariant;
  className?: string;
}) {
  if (kind === "drawio") return <DrawioLogo variant={variant} className={className} />;
  return <ExcalidrawLogo variant={variant} className={className} />;
}

export function fileKindLabel(kind: FileKind): string {
  return kind === "drawio" ? "draw.io file" : "Excalidraw file";
}

/**
 * Permanent top-left badge on a `<FileCard>` (and `<FolderCard>` previews)
 * advertising the file's renderer. Sits inside the parent's absolute
 * cluster so it can share rows with `<SharePill>` without overlap.
 *
 * The brand square *is* the chip background — we only add a thin
 * border ring for separation against the paper card (otherwise the
 * white Excalidraw chip melts into light-theme cards).
 */
export function FileKindBadge({ kind, className }: { kind: FileKind; className?: string }) {
  const label = fileKindLabel(kind);
  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      className={cn(
        "inline-block h-5 w-5 overflow-hidden rounded-md ring-1 ring-border/50",
        className,
      )}
    >
      <FileKindGlyph kind={kind} variant="full" />
    </span>
  );
}
