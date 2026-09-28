// Download helpers: single file → native download URL; several items
// or folders → client-side zip built with fflate.

import type { QueryClient } from "@tanstack/react-query";
import { zip } from "fflate";
import { type FileKind, type FileMeta, files, type ItemRef } from "@/lib/api/client";
import { ensureItems, getFoldersCached } from "./itemCache";

const EXT: Record<FileKind, string> = {
  excalidraw: ".excalidraw",
  drawio: ".drawio",
  notes: ".notes.json",
  "static-site": ".zip",
};

export function triggerUrlDownload(url: string, filename?: string): void {
  const a = document.createElement("a");
  a.href = url;
  if (filename) a.download = filename;
  else a.setAttribute("download", "");
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function filenameFromDisposition(h: string | null): string | null {
  if (!h) return null;
  const star = /filename\*=UTF-8''([^;]+)/i.exec(h);
  if (star) {
    try {
      return decodeURIComponent(star[1]);
    } catch {
      /* fall through */
    }
  }
  const plain = /filename="?([^";]+)"?/i.exec(h);
  return plain ? plain[1] : null;
}

function safeSegment(s: string): string {
  return s.replace(/[\\/:*?"<>|]+/g, "_").trim() || "untitled";
}

function uniquePath(path: string, used: Set<string>): string {
  if (!used.has(path)) {
    used.add(path);
    return path;
  }
  const dot = path.lastIndexOf(".");
  const slash = path.lastIndexOf("/");
  const hasExt = dot > slash + 1;
  const base = hasExt ? path.slice(0, dot) : path;
  const ext = hasExt ? path.slice(dot) : "";
  for (let i = 2; ; i++) {
    const cand = `${base} (${i})${ext}`;
    if (!used.has(cand)) {
      used.add(cand);
      return cand;
    }
  }
}

/** Zips the given refs (folders recursively) and downloads the archive. */
export async function downloadAsZip(
  qc: QueryClient,
  refs: ItemRef[],
  onProgress?: (done: number, total: number) => void,
): Promise<void> {
  const infos = await ensureItems(qc, refs);
  const allFolders = getFoldersCached(qc);
  const byId = new Map(allFolders.map((f) => [f.id, f]));

  // Collect (file, pathPrefix) pairs.
  const entries: Array<{
    file: FileMeta | { id: string; name: string; kind?: FileKind };
    dir: string;
  }> = [];
  for (const info of infos) {
    if (info.ref.type === "file") {
      entries.push({
        file: info.file ?? { id: info.ref.id, name: info.name, kind: info.kind },
        dir: "",
      });
      continue;
    }
    const rootName = safeSegment(info.name);
    const list = await files.list({ folderId: info.ref.id, recursive: true });
    for (const f of list) {
      // Walk up from the file's folder to the zipped root to build the relative path.
      const segs: string[] = [];
      let cur = f.folderId ? byId.get(f.folderId) : undefined;
      let guard = 0;
      while (cur && cur.id !== info.ref.id && guard++ < 64) {
        segs.unshift(safeSegment(cur.name));
        cur = cur.parentId ? byId.get(cur.parentId) : undefined;
      }
      entries.push({ file: f, dir: [rootName, ...segs].join("/") });
    }
  }
  if (entries.length === 0) throw new Error("Nothing to download");

  const used = new Set<string>();
  const out: Record<string, Uint8Array> = {};
  let done = 0;
  // Fetch with small concurrency to stay polite to the worker.
  const queue = [...entries];
  async function worker() {
    for (;;) {
      const e = queue.shift();
      if (!e) return;
      const resp = await fetch(files.downloadUrl(e.file.id), { credentials: "include" });
      if (!resp.ok) throw new Error(`Download failed for "${e.file.name}" (HTTP ${resp.status})`);
      const name =
        filenameFromDisposition(resp.headers.get("content-disposition")) ??
        `${safeSegment(e.file.name)}${e.file.kind ? EXT[e.file.kind] : ""}`;
      const path = uniquePath(e.dir ? `${e.dir}/${safeSegment(name)}` : safeSegment(name), used);
      out[path] = new Uint8Array(await resp.arrayBuffer());
      onProgress?.(++done, entries.length);
    }
  }
  await Promise.all([worker(), worker(), worker()]);

  const data = await new Promise<Uint8Array>((resolve, reject) =>
    zip(out, { level: 6 }, (err, res) => (err ? reject(err) : resolve(res))),
  );
  const zipName =
    infos.length === 1 && infos[0].ref.type === "folder"
      ? `${safeSegment(infos[0].name)}.zip`
      : `inkwell-${new Date().toISOString().slice(0, 10)}.zip`;
  const url = URL.createObjectURL(new Blob([data as BlobPart], { type: "application/zip" }));
  triggerUrlDownload(url, zipName);
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
