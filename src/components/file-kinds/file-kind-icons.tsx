// File-kind glyphs and badges.
//
//   FileKindGlyph (variant="mark", default) — the brand mark on a
//     transparent background, sized for inline use next to text in
//     menus, list rows and the command palette.
//
//   FileKindBadge — the full brand chip (colored rounded square + mark)
//     used on grid cards.
//
// Labels, descriptions, download labels and accent classes come from the
// registry in `src/lib/file-kinds.ts`; only the JSX marks live here.
// Source SVGs are inlined as React components in `./brand-logos`.

import type { FileKind } from "@/lib/api/client";
import { fileKindInfo } from "@/lib/file-kinds";
import { cn } from "@/lib/utils";
import {
  type BrandLogoVariant,
  DrawioLogo,
  ExcalidrawLogo,
  NotesLogo,
  StaticSiteLogo,
} from "./brand-logos";

export type FileKindGlyphVariant = BrandLogoVariant;

/** Inline glyph for a given file kind.
 *  - `variant="mark"` (default): just the brand mark.
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
  if (kind === "notes") return <NotesLogo variant={variant} className={className} />;
  if (kind === "static-site") return <StaticSiteLogo variant={variant} className={className} />;
  return <ExcalidrawLogo variant={variant} className={className} />;
}

/** Human label — "excalidraw file", "static site". */
export function fileKindLabel(kind: FileKind): string {
  return fileKindInfo(kind).noun;
}

/** Menu label for the per-kind download item. */
export function downloadLabelForKind(kind: FileKind): string {
  return fileKindInfo(kind).downloadLabel;
}

/** Brand chip used on grid cards and in the new-file picker. */
export function FileKindBadge({ kind, className }: { kind: FileKind; className?: string }) {
  const label = fileKindLabel(kind);
  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      className={cn(
        "inline-block size-5 overflow-hidden rounded-md ring-1 ring-border/60",
        className,
      )}
    >
      <FileKindGlyph kind={kind} variant="full" />
    </span>
  );
}

/** Small text pill naming the kind — used in list rows and filters. */
export function FileKindTag({ kind, className }: { kind: FileKind; className?: string }) {
  const info = fileKindInfo(kind);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[0.6875rem] font-medium",
        info.tintClass,
        className,
      )}
    >
      <FileKindGlyph kind={kind} className="size-3" />
      {info.label}
    </span>
  );
}
