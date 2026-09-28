// Shared types for the upload feature.

import type { FileKind } from "@/lib/api/client";

/** One file collected from a drop or a picker. `relativePath` is
 *  forward-slash separated and includes the top-level dropped directory
 *  name for directory drops (`"site/index.html"`), or is just the file
 *  name for loose files. */
export interface DroppedEntry {
  file: File;
  relativePath: string;
}

export type UploadStage =
  | "queued"
  | "creating"
  | "writing"
  | "thumbnail"
  | "done"
  | "error"
  | "skipped"
  | "conflict";

export type ConflictChoice = "keepBoth" | "replace" | "skip";

/** How a static site is sent to the worker. */
export type SiteSource = "zip" | "html" | "dir";

/** Result of planning a batch of dropped entries. Pure data — the
 *  queue turns each job into a row. */
export interface PlannedJob {
  /** `null` means unsupported (listed, never silently dropped). */
  kind: FileKind | null;
  /** Row label: the filename, or `"dir/"` for a directory site. */
  label: string;
  /** Target file name (no extension). */
  name: string;
  /** Sub-folder path below the upload target (mirrored directories). */
  dirPath: string[];
  /** One entry, or every file of a directory site. For directory sites
   *  `relativePath` is re-based onto the site root. */
  entries: DroppedEntry[];
  site?: SiteSource;
  /** Why this entry was refused (unsupported type, too large…). */
  reason?: string;
}
