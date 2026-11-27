import type { FolderMeta } from "@/lib/api/client";

// Returns the chain of folders from the root down to the given folder id.
export function folderPath(folders: FolderMeta[], id: string): FolderMeta[] {
  const byId = new Map(folders.map((f) => [f.id, f]));
  const out: FolderMeta[] = [];
  let cur = byId.get(id);
  while (cur) {
    out.unshift(cur);
    cur = cur.parentId ? byId.get(cur.parentId) : undefined;
  }
  return out;
}
