// Client-side list shaping for the explorer views.
//
// The API returns files already ordered by `updated_at DESC` (see
// `worker/db/repos/files.ts`), which covers the default view. Everything
// else — name/created/kind ordering, the name filter, the kind filter,
// recency grouping — is done here, in memory. That is deliberate: one
// account's file list is small, it is fetched once and cached by React
// Query, and keeping the shaping on the client means no new query
// parameters (and no new cache keys) per view.
//
// Known limit: the list endpoint caps at 1000 rows, so global views are
// exact for the 1000 most recently updated files. `FILE_LIST_CAP` is
// exported so views can say so when they hit it.

import type { FileKind, FileMeta, FolderMeta } from "@/lib/api/client";
import { fileKindInfo } from "@/lib/file-kinds";

import type { SortKey } from "./useViewParams";

export const FILE_LIST_CAP = 1000;

const byName = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: "base" });

export function sortFiles(files: FileMeta[], sort: SortKey): FileMeta[] {
  const out = [...files];
  switch (sort) {
    case "name":
      out.sort((a, b) => byName(a.name, b.name));
      break;
    case "created":
      out.sort((a, b) => b.createdAt - a.createdAt);
      break;
    case "kind":
      out.sort(
        (a, b) => fileKindInfo(a.kind).order - fileKindInfo(b.kind).order || byName(a.name, b.name),
      );
      break;
    default:
      out.sort((a, b) => b.updatedAt - a.updatedAt);
  }
  return out;
}

/** Folders are always alphabetical.
 *
 *  They carry no kind, and their `updatedAt` is an implementation detail
 *  (it moves when a child is added), so every sort mode still reads best
 *  as a plain A→Z list. The `SortKey` is accepted so callers can pass
 *  their current sort without special-casing folders. */
export function sortFolders(folders: FolderMeta[], _sort: SortKey): FolderMeta[] {
  return [...folders].sort((a, b) => byName(a.name, b.name));
}

export function filterFiles(
  files: FileMeta[],
  { q, kind }: { q?: string; kind?: FileKind | null },
): FileMeta[] {
  const term = (q ?? "").trim().toLowerCase();
  return files.filter((f) => {
    if (kind && f.kind !== kind) return false;
    if (term && !f.name.toLowerCase().includes(term)) return false;
    return true;
  });
}

export function filterFolders(folders: FolderMeta[], { q }: { q?: string }): FolderMeta[] {
  const term = (q ?? "").trim().toLowerCase();
  if (!term) return folders;
  return folders.filter((f) => f.name.toLowerCase().includes(term));
}

/** `id → name` lookup used by the Location column in global views. */
export function folderNameMap(folders: FolderMeta[] | null | undefined): Map<string, string> {
  const m = new Map<string, string>();
  for (const f of folders ?? []) m.set(f.id, f.name);
  return m;
}

export interface RecencyGroup {
  label: string;
  files: FileMeta[];
}

/** Split files into Today / Yesterday / Last 7 days / Last 30 days / Older. */
export function groupByRecency(files: FileMeta[]): RecencyGroup[] {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfYesterday = startOfToday - 86_400_000;
  const last7 = startOfToday - 6 * 86_400_000;
  const last30 = startOfToday - 29 * 86_400_000;

  const groups: RecencyGroup[] = [
    { label: "Today", files: [] },
    { label: "Yesterday", files: [] },
    { label: "Last 7 days", files: [] },
    { label: "Last 30 days", files: [] },
    { label: "Older", files: [] },
  ];

  for (const f of files) {
    const t = f.updatedAt;
    if (t >= startOfToday) groups[0].files.push(f);
    else if (t >= startOfYesterday) groups[1].files.push(f);
    else if (t >= last7) groups[2].files.push(f);
    else if (t >= last30) groups[3].files.push(f);
    else groups[4].files.push(f);
  }

  return groups.filter((g) => g.files.length > 0);
}
