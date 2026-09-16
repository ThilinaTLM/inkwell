// File-kind registry — the single source of truth for everything the
// dashboard needs to know about a file kind.
//
// Adding a future kind (kanban board, timeline, …) is a two-step change:
//   1. add `--kind-<id>` light/dark variables + the `--color-kind-<id>`
//      mapping in `src/index.css`,
//   2. add one entry here.
// The new-file picker, kind filters, badges, list rows, grid cards,
// download labels, and empty states all read from this table, so no
// dashboard component needs a `switch` on kind ever again. (The editor
// for the new kind is of course still its own work — see
// `src/features/editor/EditorPage.tsx`.)
//
// Brand glyphs live in `src/components/file-kinds/brand-logos.tsx`
// because they are JSX; everything else is data and lives here.

import type { FileKind } from "@/lib/api/client";

export interface FileKindInfo {
  id: FileKind;
  /** Full product name — "Excalidraw", "Draw.io". */
  label: string;
  /** Lowercase noun phrase used in sentences — "excalidraw file". */
  noun: string;
  /** One-line pitch shown in the new-file picker. */
  description: string;
  /** Default name for a freshly created file. */
  defaultName: string;
  /** Menu label for the per-kind download action. */
  downloadLabel: string;
  /** Tailwind classes for a tinted surface + text in this kind's accent. */
  tintClass: string;
  /** Tailwind class for the accent as foreground colour only. */
  textClass: string;
  /** Display order in pickers and filters. */
  order: number;
}

export const FILE_KINDS: Record<FileKind, FileKindInfo> = {
  excalidraw: {
    id: "excalidraw",
    label: "Excalidraw",
    noun: "excalidraw file",
    description: "Freehand whiteboard for quick, expressive sketches.",
    defaultName: "Untitled drawing",
    downloadLabel: "Download .excalidraw",
    tintClass: "bg-kind-excalidraw/10 text-kind-excalidraw",
    textClass: "text-kind-excalidraw",
    order: 1,
  },
  drawio: {
    id: "drawio",
    label: "Draw.io",
    noun: "draw.io file",
    description: "Structured diagrams with shapes, connectors and layers.",
    defaultName: "Untitled diagram",
    downloadLabel: "Download .drawio",
    tintClass: "bg-kind-drawio/10 text-kind-drawio",
    textClass: "text-kind-drawio",
    order: 2,
  },
  notes: {
    id: "notes",
    label: "Notes",
    noun: "notes file",
    description: "Rich text documents with headings, lists and embeds.",
    defaultName: "Untitled note",
    downloadLabel: "Download .notes.json",
    tintClass: "bg-kind-notes/10 text-kind-notes",
    textClass: "text-kind-notes",
    order: 3,
  },
  "static-site": {
    id: "static-site",
    label: "Static site",
    noun: "static site",
    description: "Publish an HTML/CSS/JS bundle behind a share link.",
    defaultName: "Untitled site",
    downloadLabel: "Download .zip",
    tintClass: "bg-kind-static/10 text-kind-static",
    textClass: "text-kind-static",
    order: 4,
  },
};

/** Every kind, in display order. */
export const FILE_KIND_LIST: readonly FileKindInfo[] = Object.values(FILE_KINDS).sort(
  (a, b) => a.order - b.order,
);

export function fileKindInfo(kind: FileKind): FileKindInfo {
  return FILE_KINDS[kind] ?? FILE_KINDS.excalidraw;
}

export function isFileKind(v: unknown): v is FileKind {
  return typeof v === "string" && v in FILE_KINDS;
}
