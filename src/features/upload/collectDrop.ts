// Collect files from a native drop or a file input, preserving folder
// structure.
//
// The FileSystem Entry API (`webkitGetAsEntry`) is non-standard but is
// the only DOM API that keeps directory structure on drop; Chromium,
// WebKit and Gecko all support it. Entries must be grabbed
// synchronously inside the drop handler — the DataTransfer is emptied
// once the event returns — so `collectDrop` snapshots them before its
// first `await`.

import type { DroppedEntry } from "./types";

type FsEntry = {
  isFile: boolean;
  isDirectory: boolean;
  name: string;
  file?: (cb: (f: File) => void, err?: (e: unknown) => void) => void;
  createReader?: () => {
    readEntries: (cb: (entries: FsEntry[]) => void, err?: (e: unknown) => void) => void;
  };
};

/** True when a drag carries OS files (not an internal item drag). */
export function dragHasFiles(dt: DataTransfer | null | undefined): boolean {
  if (!dt) return false;
  const types = dt.types;
  if (!types) return false;
  for (let i = 0; i < types.length; i++) if (types[i] === "Files") return true;
  return false;
}

export async function collectDrop(dt: DataTransfer): Promise<DroppedEntry[]> {
  // Synchronous snapshot — see the header comment.
  const roots: FsEntry[] = [];
  const items = dt.items;
  if (items && items.length > 0 && typeof items[0].webkitGetAsEntry === "function") {
    for (let i = 0; i < items.length; i++) {
      if (items[i].kind !== "file") continue;
      const entry = items[i].webkitGetAsEntry() as FsEntry | null;
      if (entry) roots.push(entry);
    }
  }
  const flat = Array.from(dt.files ?? []);

  if (roots.length === 0) {
    return flat.map((file) => ({ file, relativePath: file.name }));
  }
  const out: DroppedEntry[] = [];
  await Promise.all(roots.map((r) => walkEntry(r, "", out)));
  return out;
}

/** Entries from an `<input type=file>` (keeps `webkitRelativePath`,
 *  which includes the picked directory's own name). */
export function fileListToEntries(list: FileList | File[] | null | undefined): DroppedEntry[] {
  if (!list) return [];
  return Array.from(list).map((file) => {
    const rel = (file as File & { webkitRelativePath?: string }).webkitRelativePath;
    return { file, relativePath: rel && rel.length > 0 ? rel : file.name };
  });
}

async function walkEntry(e: FsEntry, prefix: string, out: DroppedEntry[]): Promise<void> {
  if (e.isFile && e.file) {
    await new Promise<void>((resolve) => {
      e.file?.(
        (f) => {
          out.push({ file: f, relativePath: prefix ? `${prefix}/${e.name}` : e.name });
          resolve();
        },
        () => resolve(),
      );
    });
    return;
  }
  if (e.isDirectory && e.createReader) {
    const reader = e.createReader();
    const children: FsEntry[] = [];
    await new Promise<void>((resolve) => {
      // `readEntries` returns batches (100 in Chromium) until empty.
      const drain = () =>
        reader.readEntries(
          (batch) => {
            if (batch.length === 0) {
              resolve();
              return;
            }
            children.push(...batch);
            drain();
          },
          () => resolve(),
        );
      drain();
    });
    const next = prefix ? `${prefix}/${e.name}` : e.name;
    await Promise.all(children.map((c) => walkEntry(c, next, out)));
  }
}
