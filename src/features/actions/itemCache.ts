// TanStack-cache helpers for item metadata lookup and cheap optimistic
// updates. Shared by useItemActions, the dialogs and the palette.
//
// PUBLIC CONTRACT
//   interface ItemInfo { ref; name; parentId; kind?; starredAt; tags; file?; folder? }
//   resolveItems(qc, refs): ItemInfo[]          – sync, from cache; unknown items get
//                                                  name "Untitled" and parentId null
//   ensureItems(qc, refs): Promise<ItemInfo[]>   – fetches folders / all files when missing
//   findFileMeta(qc, id) / findFolderMeta(qc, id)
//   useItemMeta(ref): FileMeta | FolderMeta | null   – reactive (query-cache subscription)
//   getFoldersCached(qc): FolderMeta[]
//   folderPathLabel(folders, folderId): string    – "Home / A / B"
//   descendantFolderIds(folders, rootIds): Set<string>  (includes roots)
//   patchFileLists / patchFolderList / removeFromLists – optimistic helpers

import { type QueryClient, useQueryClient } from "@tanstack/react-query";
import { useCallback, useSyncExternalStore } from "react";
import {
  type FileKind,
  type FileMeta,
  type FilesQuery,
  type FolderMeta,
  files,
  folders as foldersApi,
  type ItemRef,
  type LoadedFile,
} from "@/lib/api/client";
import { keys } from "@/lib/api/query-keys";

export interface ItemInfo {
  ref: ItemRef;
  name: string;
  parentId: string | null;
  kind?: FileKind;
  starredAt: number | null;
  tags: string[];
  file?: FileMeta;
  folder?: FolderMeta;
}

export function getFoldersCached(qc: QueryClient): FolderMeta[] {
  return qc.getQueryData<FolderMeta[]>(keys.folders.list()) ?? [];
}

export function findFolderMeta(qc: QueryClient, id: string): FolderMeta | undefined {
  return getFoldersCached(qc).find((f) => f.id === id);
}

export function findFileMeta(qc: QueryClient, id: string): FileMeta | undefined {
  for (const [, data] of qc.getQueriesData<FileMeta[]>({ queryKey: keys.files.listPrefix() })) {
    const hit = Array.isArray(data) ? data.find((f) => f.id === id) : undefined;
    if (hit) return hit;
  }
  return undefined;
}

function detailFallback(qc: QueryClient, id: string): LoadedFile | undefined {
  return qc.getQueryData<LoadedFile>(keys.files.detail(id));
}

function infoFor(qc: QueryClient, ref: ItemRef): ItemInfo {
  if (ref.type === "folder") {
    const f = findFolderMeta(qc, ref.id);
    return {
      ref,
      name: f?.name ?? "Untitled folder",
      parentId: f?.parentId ?? null,
      starredAt: f?.starredAt ?? null,
      tags: f?.tags ?? [],
      folder: f,
    };
  }
  const m = findFileMeta(qc, ref.id);
  if (m) {
    return {
      ref,
      name: m.name,
      parentId: m.folderId,
      kind: m.kind,
      starredAt: m.starredAt ?? null,
      tags: m.tags,
      file: m,
    };
  }
  const d = detailFallback(qc, ref.id);
  return {
    ref,
    name: d?.meta.name ?? "Untitled",
    parentId: d?.meta.folderId ?? null,
    kind: d?.meta.kind,
    starredAt: null,
    tags: [],
  };
}

export function resolveItems(qc: QueryClient, refs: ItemRef[]): ItemInfo[] {
  return refs.map((r) => infoFor(qc, r));
}

export async function ensureItems(qc: QueryClient, refs: ItemRef[]): Promise<ItemInfo[]> {
  const needFolders = refs.some((r) => r.type === "folder" && !findFolderMeta(qc, r.id));
  if (needFolders || !qc.getQueryData(keys.folders.list())) {
    await qc
      .fetchQuery({ queryKey: keys.folders.list(), queryFn: () => foldersApi.list() })
      .catch(() => undefined);
  }
  const needFiles = refs.some((r) => r.type === "file" && !findFileMeta(qc, r.id));
  if (needFiles) {
    const q: FilesQuery = {};
    await qc
      .fetchQuery({ queryKey: keys.files.list(q), queryFn: () => files.list(q) })
      .catch(() => undefined);
  }
  return resolveItems(qc, refs);
}

/** Reactive metadata for a ref, read from whatever list caches exist. */
export function useItemMeta(ref: ItemRef | null | undefined): FileMeta | FolderMeta | null {
  const qc = useQueryClient();
  const subscribe = useCallback((l: () => void) => qc.getQueryCache().subscribe(l), [qc]);
  const get = () => {
    if (!ref) return null;
    return (ref.type === "folder" ? findFolderMeta(qc, ref.id) : findFileMeta(qc, ref.id)) ?? null;
  };
  return useSyncExternalStore(subscribe, get, get);
}

export function folderPathLabel(all: FolderMeta[], folderId: string | null): string {
  const byId = new Map(all.map((f) => [f.id, f]));
  const names: string[] = [];
  let cur = folderId ? byId.get(folderId) : undefined;
  let guard = 0;
  while (cur && guard++ < 64) {
    names.unshift(cur.name);
    cur = cur.parentId ? byId.get(cur.parentId) : undefined;
  }
  return ["Home", ...names].join(" / ");
}

export function descendantFolderIds(all: FolderMeta[], rootIds: Iterable<string>): Set<string> {
  const children = new Map<string, string[]>();
  for (const f of all) {
    if (!f.parentId) continue;
    const arr = children.get(f.parentId) ?? [];
    arr.push(f.id);
    children.set(f.parentId, arr);
  }
  const out = new Set<string>();
  const stack = [...rootIds];
  while (stack.length) {
    const id = stack.pop() as string;
    if (out.has(id)) continue;
    out.add(id);
    stack.push(...(children.get(id) ?? []));
  }
  return out;
}

// ─── Optimistic helpers ────────────────────────────────────────────────

export function patchFileLists(
  qc: QueryClient,
  ids: Set<string>,
  patch: (f: FileMeta) => FileMeta,
): void {
  qc.setQueriesData<FileMeta[]>({ queryKey: keys.files.listPrefix() }, (old) =>
    Array.isArray(old) ? old.map((f) => (ids.has(f.id) ? patch(f) : f)) : old,
  );
}

export function patchFolderList(
  qc: QueryClient,
  ids: Set<string>,
  patch: (f: FolderMeta) => FolderMeta,
): void {
  qc.setQueryData<FolderMeta[]>(keys.folders.list(), (old) =>
    Array.isArray(old) ? old.map((f) => (ids.has(f.id) ? patch(f) : f)) : old,
  );
}

/** Removes files (by id) and folders (by id, with descendants) from all lists. */
export function removeFromLists(qc: QueryClient, refs: ItemRef[]): void {
  const fileIds = new Set(refs.filter((r) => r.type === "file").map((r) => r.id));
  const folderRoots = refs.filter((r) => r.type === "folder").map((r) => r.id);
  const allFolders = getFoldersCached(qc);
  const goneFolders = descendantFolderIds(allFolders, folderRoots);
  qc.setQueriesData<FileMeta[]>({ queryKey: keys.files.listPrefix() }, (old) =>
    Array.isArray(old)
      ? old.filter((f) => !fileIds.has(f.id) && !(f.folderId && goneFolders.has(f.folderId)))
      : old,
  );
  if (goneFolders.size) {
    qc.setQueryData<FolderMeta[]>(keys.folders.list(), (old) =>
      Array.isArray(old) ? old.filter((f) => !goneFolders.has(f.id)) : old,
    );
  }
}

/** Optimistically move items: patches parent ids and drops files from
 *  direct-folder listings they no longer belong to. */
export function applyMoveToCache(qc: QueryClient, refs: ItemRef[], target: string | null): void {
  const fileIds = new Set(refs.filter((r) => r.type === "file").map((r) => r.id));
  const folderIds = new Set(refs.filter((r) => r.type === "folder").map((r) => r.id));
  for (const query of qc.getQueryCache().findAll({ queryKey: keys.files.listPrefix() })) {
    const q = (query.queryKey[2] ?? {}) as FilesQuery;
    qc.setQueryData<FileMeta[]>(query.queryKey, (old) => {
      if (!Array.isArray(old)) return old;
      const patched = old.map((f) => (fileIds.has(f.id) ? { ...f, folderId: target } : f));
      if (q.folderId && !q.recursive) {
        const want = q.folderId === "root" ? null : q.folderId;
        return patched.filter((f) => !fileIds.has(f.id) || f.folderId === want);
      }
      return patched;
    });
  }
  if (folderIds.size) patchFolderList(qc, folderIds, (f) => ({ ...f, parentId: target }));
}
