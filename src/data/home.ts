// Home / project data hooks.
//
// Everything here is derived from the two list endpoints the app already
// polls (`GET /api/folders`, `GET /api/files`), so no extra endpoint exists
// and the data stays consistent with the rest of the cache.
//
//   useProjects()          top-level folders (`parentId === null`) with
//                          RECURSIVE item counts over their whole subtree.
//   usePinnedProjects()    projects with `pinnedAt`, most recently pinned first.
//   usePinProject()        pin / unpin mutation (PATCH `pinnedAt`).
//   useRecentFiles(limit)  newest-edited files across all folders, each with
//                          its folder path and owning project.
//   useInboxFiles()        loose root files (`folderId === null`), newest first.
//
// Pure helpers (`buildProjects`, `folderPath`, `withLocation`) are exported
// for tests and for pages that already hold the folder list.

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { type ApiError, type FileMeta, type FolderMeta, folders } from "@/lib/api/client";
import { useFiles } from "./files";
import { useFolders } from "./folders";
import { invalidations } from "./invalidations";

/** A project is a top-level folder plus aggregate counts. */
export interface Project extends FolderMeta {
  /** Files in the project's whole subtree (the project folder included). */
  totalFileCount: number;
  /** Sub-folders in the project's whole subtree (the project itself excluded). */
  totalFolderCount: number;
  /** `totalFileCount + totalFolderCount`. */
  itemCount: number;
}

export interface FolderCrumb {
  id: string;
  name: string;
}

/** A file annotated with where it lives. */
export interface LocatedFile extends FileMeta {
  /** Ancestors from the project down to the direct parent; `[]` for root files. */
  folderPath: FolderCrumb[];
  /** The top-level folder the file lives under; `null` for root (inbox) files. */
  project: FolderCrumb | null;
}

/** Ancestor chain of `folderId`, root-most first, including the folder itself.
 *  Unknown ids yield `[]`. Guards against cycles. */
export function folderPath(all: readonly FolderMeta[], folderId: string | null): FolderCrumb[] {
  if (!folderId) return [];
  const byId = new Map(all.map((f) => [f.id, f]));
  const out: FolderCrumb[] = [];
  const seen = new Set<string>();
  let cur = byId.get(folderId);
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id);
    out.unshift({ id: cur.id, name: cur.name });
    cur = cur.parentId ? byId.get(cur.parentId) : undefined;
  }
  return out;
}

/** Top-level folders with recursive counts, in `name` order of the input. */
export function buildProjects(all: readonly FolderMeta[]): Project[] {
  const children = new Map<string, FolderMeta[]>();
  for (const f of all) {
    if (!f.parentId) continue;
    const arr = children.get(f.parentId);
    if (arr) arr.push(f);
    else children.set(f.parentId, [f]);
  }
  const totals = (f: FolderMeta, seen: Set<string>): { files: number; folders: number } => {
    seen.add(f.id);
    let files = f.fileCount;
    let subs = 0;
    for (const c of children.get(f.id) ?? []) {
      if (seen.has(c.id)) continue;
      const t = totals(c, seen);
      files += t.files;
      subs += 1 + t.folders;
    }
    return { files, folders: subs };
  };
  return all
    .filter((f) => !f.parentId)
    .map((f) => {
      const t = totals(f, new Set());
      return {
        ...f,
        totalFileCount: t.files,
        totalFolderCount: t.folders,
        itemCount: t.files + t.folders,
      };
    });
}

export function withLocation(
  files: readonly FileMeta[],
  all: readonly FolderMeta[],
): LocatedFile[] {
  return files.map((f) => {
    const path = folderPath(all, f.folderId);
    return { ...f, folderPath: path, project: path[0] ?? null };
  });
}

// ─── Hooks ────────────────────────────────────────────────────────────
export function useProjects() {
  const q = useFolders();
  const data = useMemo(() => (q.data ? buildProjects(q.data) : undefined), [q.data]);
  return { ...q, data };
}

export function usePinnedProjects() {
  const q = useProjects();
  const data = useMemo(
    () =>
      q.data
        ?.filter((p) => p.pinnedAt !== null)
        .sort((a, b) => (b.pinnedAt ?? 0) - (a.pinnedAt ?? 0)),
    [q.data],
  );
  return { ...q, data };
}

/** Pin or unpin a project (or any folder). Variables: `{ id, pinned }`. */
export function usePinProject() {
  const qc = useQueryClient();
  return useMutation<FolderMeta, ApiError, { id: string; pinned: boolean }>({
    mutationFn: ({ id, pinned }) => folders.update(id, { pinnedAt: pinned ? Date.now() : null }),
    onSuccess: () => invalidations.folderMutated(qc),
  });
}

/** Most recently edited files across every folder (and the root), newest first. */
export function useRecentFiles(limit = 12) {
  const files = useFiles({ limit });
  const foldersQ = useFolders();
  const data = useMemo(
    () => (files.data && foldersQ.data ? withLocation(files.data, foldersQ.data) : undefined),
    [files.data, foldersQ.data],
  );
  return {
    data,
    isPending: files.isPending || foldersQ.isPending,
    isError: files.isError || foldersQ.isError,
    error: files.error ?? foldersQ.error,
    refetch: () => Promise.all([files.refetch(), foldersQ.refetch()]),
  };
}

/** Loose root files — the Inbox — newest first. */
export function useInboxFiles() {
  const q = useFiles({ folderId: "root" });
  const data = useMemo(
    () => q.data && [...q.data].sort((a, b) => b.updatedAt - a.updatedAt),
    [q.data],
  );
  return { ...q, data };
}
