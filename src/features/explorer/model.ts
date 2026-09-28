// Explorer item model shared by every view (Grid / Compact / List /
// Columns) and reused by the library pages (Recent, Starred, Tag,
// Trash) and the public shared-folder page.
//
// PUBLIC CONTRACT
//   type ItemKind = FileKind | "folder"
//   interface ExplorerItem { key; ref; type; id; name; kind; parentId; tags; starred;
//     shareCount; sizeBytes; createdAt; updatedAt; itemCount?; thumbUrl; file?; folder?;
//     extra? }
//   toExplorerItems(folders, files, opts?): ExplorerItem[]
//   folderToItem(f) / fileToItem(f, opts?) / trashToItem(t)
//   sortItems(items, sorts, opts?): ExplorerItem[]      – stable, multi-key, folders first
//   filterItems(items, filter): ExplorerItem[]
//   KIND_META / KIND_ORDER / kindLabel(kind)
//   summarize(items): { folders; files; bytes }

import type {
  FileKind,
  FileMeta,
  FolderMeta,
  ItemRef,
  ItemType,
  TrashItem,
} from "@/lib/api/client";
import { files as filesApi } from "@/lib/api/client";

export type ItemKind = FileKind | "folder";

export interface ExplorerItem {
  /** `refKey(ref)` — "file:<id>" / "folder:<id>". Unique per list. */
  key: string;
  ref: ItemRef;
  type: ItemType;
  id: string;
  name: string;
  kind: ItemKind;
  parentId: string | null;
  tags: string[];
  starred: boolean;
  shareCount: number;
  /** Files only (folders: null). */
  sizeBytes: number | null;
  createdAt: number;
  updatedAt: number;
  /** Folders: direct children (files + subfolders). */
  itemCount?: number;
  /** Thumbnail URL (files with a thumb; folders: newest preview). */
  thumbUrl: string | null;
  file?: FileMeta;
  folder?: FolderMeta;
  /** Page-specific data (e.g. Trash `deletedAt` / `purgeAt`). */
  extra?: Record<string, unknown>;
}

export const KIND_ORDER: FileKind[] = ["excalidraw", "drawio", "notes", "static-site"];

export const KIND_META: Record<ItemKind, { label: string; short: string; color: string }> = {
  folder: { label: "Folder", short: "", color: "var(--color-folder)" },
  excalidraw: { label: "Excalidraw", short: "EX", color: "#8b87ff" },
  drawio: { label: "Draw.io", short: "DR", color: "#f08705" },
  notes: { label: "Markdown", short: "MD", color: "#5aa9ff" },
  "static-site": { label: "Static site", short: "SI", color: "#4cc38a" },
};

export function kindLabel(kind: ItemKind): string {
  return (KIND_META[kind] ?? KIND_META.excalidraw).label;
}

/** Unknown / legacy kinds render as Excalidraw (the original kind). */
export function normalizeKind(kind: string | null | undefined): FileKind {
  return (KIND_ORDER as string[]).includes(kind ?? "") ? (kind as FileKind) : "excalidraw";
}

export function folderToItem(f: FolderMeta): ExplorerItem {
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
    folder: f,
  };
}

export function fileToItem(f: FileMeta, opts: { thumbUrl?: (f: FileMeta) => string } = {}) {
  const item: ExplorerItem = {
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
    thumbUrl: f.hasThumb
      ? opts.thumbUrl
        ? opts.thumbUrl(f)
        : filesApi.thumbUrl(f.id, f.thumbUpdatedAt)
      : null,
    file: f,
  };
  return item;
}

/** Trash rows → items (`extra` carries originalPath / deletedAt / purgeAt). */
export function trashToItem(t: TrashItem): ExplorerItem {
  return {
    key: `${t.type}:${t.id}`,
    ref: { type: t.type, id: t.id },
    type: t.type,
    id: t.id,
    name: t.name,
    kind: t.type === "folder" ? "folder" : normalizeKind(t.kind),
    parentId: t.originalParentId,
    tags: [],
    starred: false,
    shareCount: 0,
    sizeBytes: t.type === "file" ? (t.sizeBytes ?? 0) : null,
    createdAt: t.deletedAt,
    updatedAt: t.deletedAt,
    itemCount: t.itemCount,
    thumbUrl: null,
    extra: {
      originalPath: t.originalPath,
      deletedAt: t.deletedAt,
      purgeAt: t.purgeAt,
    },
  };
}

/** Folders first (in given order), then files. Pass the *direct
 *  children* you want shown; no filtering by parent happens here. */
export function toExplorerItems(
  folders: readonly FolderMeta[],
  files: readonly FileMeta[],
  opts: { thumbUrl?: (f: FileMeta) => string } = {},
): ExplorerItem[] {
  return [...folders.map(folderToItem), ...files.map((f) => fileToItem(f, opts))];
}

// ─── Sorting ────────────────────────────────────────────────────────────

export interface ItemSort {
  /** A `SortKey` ("name" | "modified" | "created" | "size" | "kind") or a
   *  custom key resolved through `opts.getters`. */
  key: string;
  dir: "asc" | "desc";
}

export type SortGetter = (item: ExplorerItem) => string | number | null | undefined;

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

const BUILTIN_GETTERS: Record<string, SortGetter> = {
  name: (i) => i.name,
  modified: (i) => i.updatedAt,
  created: (i) => i.createdAt,
  size: (i) => (i.type === "folder" ? (i.itemCount ?? 0) : (i.sizeBytes ?? 0)),
  kind: (i) => (i.kind === "folder" ? "" : kindLabel(i.kind)),
  tags: (i) => i.tags.join(","),
  shared: (i) => i.shareCount,
};

function compareValues(a: unknown, b: unknown): number {
  const an = a === null || a === undefined;
  const bn = b === null || b === undefined;
  if (an || bn) return an === bn ? 0 : an ? 1 : -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  return collator.compare(String(a), String(b));
}

/** Stable multi-key sort. Name is always the final tie-breaker. */
export function sortItems(
  items: readonly ExplorerItem[],
  sorts: ItemSort | readonly ItemSort[],
  opts: { foldersFirst?: boolean; getters?: Record<string, SortGetter> } = {},
): ExplorerItem[] {
  const list = Array.isArray(sorts) ? (sorts as ItemSort[]) : [sorts as ItemSort];
  const foldersFirst = opts.foldersFirst ?? true;
  const getters = { ...BUILTIN_GETTERS, ...opts.getters };
  const indexed = items.map((item, i) => ({ item, i }));
  indexed.sort((x, y) => {
    if (foldersFirst && x.item.type !== y.item.type) return x.item.type === "folder" ? -1 : 1;
    for (const s of list) {
      const g = getters[s.key];
      if (!g) continue;
      const c = compareValues(g(x.item), g(y.item));
      if (c !== 0) return s.dir === "desc" ? -c : c;
    }
    const n = collator.compare(x.item.name, y.item.name);
    return n !== 0 ? n : x.i - y.i;
  });
  return indexed.map((x) => x.item);
}

// ─── Filtering ──────────────────────────────────────────────────────────

export interface ItemFilter {
  /** Case-insensitive substring over name and tags. */
  text?: string;
  /** Empty / undefined = all kinds. Include "folder" to keep folders;
   *  when only file kinds are listed, folders are hidden. */
  kinds?: ReadonlySet<ItemKind> | readonly ItemKind[];
  /** Exact tag (case-insensitive). */
  tag?: string | null;
}

export function filterItems(items: readonly ExplorerItem[], f: ItemFilter): ExplorerItem[] {
  const text = f.text?.trim().toLowerCase() ?? "";
  const kinds = f.kinds ? new Set(f.kinds) : null;
  const tag = f.tag?.trim().toLowerCase() || null;
  return items.filter((i) => {
    if (kinds && kinds.size > 0 && !kinds.has(i.kind)) return false;
    if (tag && !i.tags.some((t) => t.toLowerCase() === tag)) return false;
    if (text) {
      const hay = `${i.name}\n${i.tags.join("\n")}`.toLowerCase();
      if (!hay.includes(text)) return false;
    }
    return true;
  });
}

export function summarize(items: readonly ExplorerItem[]): {
  folders: number;
  files: number;
  bytes: number;
} {
  let folders = 0;
  let files = 0;
  let bytes = 0;
  for (const i of items) {
    if (i.type === "folder") folders++;
    else {
      files++;
      bytes += i.sizeBytes ?? 0;
    }
  }
  return { folders, files, bytes };
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}
