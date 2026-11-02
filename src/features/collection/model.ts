// Item model + helpers for <ItemCollection>.
//
// PUBLIC CONTRACT
//   type CollectionKind = FileKind | "file" | "folder"
//   interface CollectionItem { key; ref; type; id; name; kind; parentId; starred; shareCount;
//     sizeBytes; createdAt; updatedAt; itemCount?; thumbUrl; tags; project?; isProject; file?; folder? }
//   toCollectionItems(folders, files): CollectionItem[]      – default-sorted (see sortCollectionItems)
//   fileToCollectionItem(f) / folderToCollectionItem(f)
//   sortCollectionItems(items)                               – folders first, then updatedAt desc
//   KIND_FILTERS / matchesKindFilter(item, filter) / kindLabel(kind) / formatBytes(n)
//
// Unknown / new kinds ("file" from the generic-file contract) are tolerated:
// `FileMeta.kind` is read through `String(...)` so the model keeps working
// whatever the backend adds.

import type { ProjectFields } from "@/components/project/projectStyle";
import { type FileKind, type FileMeta, type FolderMeta, files as filesApi } from "@/lib/api/client";

export type CollectionKind = FileKind | "file" | "folder";

export interface CollectionItem {
  /** "file:<id>" / "folder:<id>" — unique per list. */
  key: string;
  ref: { type: "file" | "folder"; id: string };
  type: "file" | "folder";
  id: string;
  name: string;
  kind: CollectionKind;
  /** Containing folder (`null` = root / inbox). */
  parentId: string | null;
  tags: string[];
  starred: boolean;
  shareCount: number;
  /** Files only. */
  sizeBytes: number | null;
  createdAt: number;
  updatedAt: number;
  /** Folders: direct children (files + subfolders). */
  itemCount?: number;
  thumbUrl: string | null;
  /** Folders only: icon/colour/status/description. */
  project?: ProjectFields;
  /** Folder at the top level (`parentId === null`). */
  isProject: boolean;
  /** Generic-file MIME type, when known. */
  mime?: string | null;
  file?: FileMeta;
  folder?: FolderMeta;
}

const KNOWN_KINDS: readonly string[] = ["excalidraw", "drawio", "notes", "static-site", "file"];

function normalizeKind(kind: string | null | undefined): CollectionKind {
  return KNOWN_KINDS.includes(kind ?? "") ? (kind as CollectionKind) : "excalidraw";
}

export function folderToCollectionItem(f: FolderMeta): CollectionItem {
  const p = f.previews?.[0];
  return {
    key: `folder:${f.id}`,
    ref: { type: "folder", id: f.id },
    type: "folder",
    id: f.id,
    name: f.name,
    kind: "folder",
    parentId: f.parentId,
    tags: f.tags ?? [],
    starred: !!f.starredAt,
    shareCount: f.activeShareCount ?? 0,
    sizeBytes: null,
    createdAt: f.createdAt,
    updatedAt: f.updatedAt,
    itemCount: (f.fileCount ?? 0) + (f.subfolderCount ?? 0),
    thumbUrl: p?.hasThumb ? filesApi.thumbUrl(p.id, p.thumbUpdatedAt) : null,
    project: f as FolderMeta & ProjectFields,
    isProject: f.parentId === null,
    folder: f,
  };
}

export function fileToCollectionItem(f: FileMeta): CollectionItem {
  return {
    key: `file:${f.id}`,
    ref: { type: "file", id: f.id },
    type: "file",
    id: f.id,
    name: f.name,
    kind: normalizeKind(f.kind),
    parentId: f.folderId,
    tags: f.tags ?? [],
    starred: !!f.starredAt,
    shareCount: f.activeShareCount ?? 0,
    sizeBytes: f.sizeBytes ?? 0,
    createdAt: f.createdAt,
    updatedAt: f.updatedAt,
    thumbUrl: f.hasThumb ? filesApi.thumbUrl(f.id, f.thumbUpdatedAt) : null,
    mime: (f as FileMeta & { mime?: string | null }).mime ?? null,
    isProject: false,
    file: f,
  };
}

/** Default order: folders first, then most recently updated. */
export function sortCollectionItems(items: readonly CollectionItem[]): CollectionItem[] {
  return [...items].sort((a, b) => {
    if (a.type !== b.type) return a.type === "folder" ? -1 : 1;
    return b.updatedAt - a.updatedAt || a.name.localeCompare(b.name);
  });
}

export function toCollectionItems(
  folders: readonly FolderMeta[],
  files: readonly FileMeta[],
): CollectionItem[] {
  return sortCollectionItems([
    ...folders.map(folderToCollectionItem),
    ...files.map(fileToCollectionItem),
  ]);
}

// ─── Kind filters ───────────────────────────────────────────────────────

export type KindFilter = "all" | "excalidraw" | "notes" | "drawio" | "static-site" | "file";

export const KIND_FILTERS: Array<{ id: KindFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "excalidraw", label: "Boards" },
  { id: "notes", label: "Notes" },
  { id: "drawio", label: "Diagrams" },
  { id: "static-site", label: "Sites" },
  { id: "file", label: "Files" },
];

export function matchesKindFilter(item: CollectionItem, filter: KindFilter): boolean {
  return filter === "all" || (item.type === "file" && item.kind === filter);
}

export function kindLabel(kind: CollectionKind): string {
  switch (kind) {
    case "folder":
      return "Folder";
    case "excalidraw":
      return "Board";
    case "notes":
      return "Note";
    case "drawio":
      return "Diagram";
    case "static-site":
      return "Site";
    default:
      return "File";
  }
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v >= 10 || i === 0 ? Math.round(v) : v.toFixed(1)} ${units[i]}`;
}
