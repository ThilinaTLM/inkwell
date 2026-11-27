// Default names for newly created files (renaming happens in the editor title).

import type { FileKind } from "@/lib/api/client";

export type CaptureKind = Extract<FileKind, "notes" | "excalidraw" | "drawio">;

function shortDate(d = new Date()): string {
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function defaultCaptureName(kind: CaptureKind): string {
  switch (kind) {
    case "notes":
      return "Untitled note";
    case "excalidraw":
      return `Untitled board · ${shortDate()}`;
    case "drawio":
      return `Untitled diagram · ${shortDate()}`;
  }
}
