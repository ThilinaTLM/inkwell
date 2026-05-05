// File-kind glyphs.
//
// Tiny brand-flavoured marks used wherever the UI needs to signal a
// file type at a glance: card top-left badges, dropdown items in the
// "New file" split-button, the right-click menu, and folder-card
// previews. Kept here so all surfaces share a single visual vocabulary.
//
// Excalidraw — a sketched pencil mark, mirrored from Hugeicons'
//   `Edit02Icon` so it ties visually to the rest of the editor chrome.
// Draw.io   — a hand-drawn diamond + rectangle pair, evoking a
//   flowchart node. We don't use the official drawio mark (trademarked)
//   and Hugeicons doesn't ship one; this glyph stays muted enough to
//   read as "diagram" without competing with the share pill's accent.

import { Edit02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { FileKind } from "@/lib/api/client";
import { cn } from "@/lib/utils";

/** Inline glyph for a given file kind. Sized via Tailwind class on the parent. */
export function FileKindGlyph({ kind, className }: { kind: FileKind; className?: string }) {
  if (kind === "drawio") {
    return (
      <svg
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={cn("size-3.5", className)}
        aria-hidden
      >
        <title>draw.io</title>
        {/* a diamond connected to a rounded rectangle — a tiny
            flowchart that reads as "diagram" at this size. */}
        <path d="M4 5 L6 3 L8 5 L6 7 Z" />
        <rect x="9.5" y="9" width="4.5" height="3.5" rx="0.6" />
        <path d="M7 6.5 L10 9.5" />
      </svg>
    );
  }
  return (
    <HugeiconsIcon
      icon={Edit02Icon}
      strokeWidth={1.8}
      className={cn("size-3.5", className)}
      aria-hidden
    />
  );
}

export function fileKindLabel(kind: FileKind): string {
  return kind === "drawio" ? "draw.io file" : "Excalidraw file";
}

/**
 * Permanent top-left badge on a `<FileCard>` (and `<FolderCard>` previews)
 * advertising the file's renderer. Sits inside the parent's absolute
 * cluster so it can share rows with `<SharePill>` without overlap.
 *
 * Visual: a tiny rounded square that sits *on the paper sheet* (not on
 * the desk). Muted by default — `text-muted-foreground` + `bg-card/80`
 * with backdrop blur — so the share pill's accent colour stays the
 * loudest thing in the corner.
 */
export function FileKindBadge({ kind, className }: { kind: FileKind; className?: string }) {
  const label = fileKindLabel(kind);
  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex h-5 w-5 items-center justify-center rounded-md",
        "bg-card/80 text-muted-foreground ring-1 ring-border/50 backdrop-blur-sm",
        className,
      )}
    >
      <FileKindGlyph kind={kind} />
    </span>
  );
}
