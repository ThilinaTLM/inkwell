// Thin local item model for the library pages.
//
// NOTE (reconcile with WS-C): the explorer's `ExplorerItem` /
// `toExplorerItems` / `sortItems` (src/features/explorer/model.ts) did not
// exist yet when this was written, so the library pages use this adapter.
// It intentionally mirrors the expected shape (ref, name, kind, parentId,
// updatedAt, sizeBytes, tags, starredAt, file | folder) so swapping it for
// the explorer model is a mechanical change.
//
// PUBLIC CONTRACT
//   interface LibraryItem { key; ref; name; kind?; parentId; location; updatedAt; createdAt;
//                           sizeBytes: number | null; tags; starredAt; shared; file?; folder? }
//   toLibraryItems({ files?, folders?, allFolders }): LibraryItem[]
//   type LibrarySortKey = "name" | "location" | "modified" | "size" | "kind" | "starred"
//   sortLibraryItems(items, sort, foldersFirst?): LibraryItem[]

import { folderPathLabel } from "@/features/actions/itemCache";
import type { FileKind, FileMeta, FolderMeta, ItemRef } from "@/lib/api/client";

export interface LibraryItem {
  key: string;
  ref: ItemRef;
  name: string;
  kind?: FileKind;
  parentId: string | null;
  location: string;
  updatedAt: number;
  createdAt: number;
  sizeBytes: number | null;
  tags: string[];
  starredAt: number | null;
  shared: boolean;
  file?: FileMeta;
  folder?: FolderMeta;
}

export function toLibraryItems({
  files = [],
  folders = [],
  allFolders,
}: {
  files?: readonly FileMeta[];
  folders?: readonly FolderMeta[];
  allFolders: FolderMeta[];
}): LibraryItem[] {
  const out: LibraryItem[] = [];
  for (const f of folders) {
    out.push({
      key: `folder:${f.id}`,
      ref: { type: "folder", id: f.id },
      name: f.name,
      parentId: f.parentId,
      location: folderPathLabel(allFolders, f.parentId),
      updatedAt: f.updatedAt,
      createdAt: f.createdAt,
      sizeBytes: null,
      tags: f.tags,
      starredAt: f.starredAt,
      shared: f.activeShareCount > 0,
      folder: f,
    });
  }
  for (const f of files) {
    out.push({
      key: `file:${f.id}`,
      ref: { type: "file", id: f.id },
      name: f.name,
      kind: f.kind,
      parentId: f.folderId,
      location: folderPathLabel(allFolders, f.folderId),
      updatedAt: f.updatedAt,
      createdAt: f.createdAt,
      sizeBytes: f.sizeBytes,
      tags: f.tags,
      starredAt: f.starredAt,
      shared: f.activeShareCount > 0,
      file: f,
    });
  }
  return out;
}

export type LibrarySortKey = "name" | "location" | "modified" | "size" | "kind" | "starred";

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

export function sortLibraryItems(
  items: readonly LibraryItem[],
  sort: { key: LibrarySortKey; dir: "asc" | "desc" },
  foldersFirst = false,
): LibraryItem[] {
  const sign = sort.dir === "asc" ? 1 : -1;
  const cmp = (a: LibraryItem, b: LibraryItem): number => {
    switch (sort.key) {
      case "name":
        return collator.compare(a.name, b.name);
      case "location":
        return collator.compare(a.location, b.location) || collator.compare(a.name, b.name);
      case "modified":
        return a.updatedAt - b.updatedAt;
      case "size":
        return (a.sizeBytes ?? -1) - (b.sizeBytes ?? -1);
      case "kind":
        return collator.compare(a.kind ?? "", b.kind ?? "") || collator.compare(a.name, b.name);
      case "starred":
        return (a.starredAt ?? 0) - (b.starredAt ?? 0);
    }
  };
  return [...items].sort((a, b) => {
    if (foldersFirst && a.ref.type !== b.ref.type) return a.ref.type === "folder" ? -1 : 1;
    return sign * cmp(a, b);
  });
}
