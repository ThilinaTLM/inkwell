// Per-kind upload pipeline: prepare (read + validate + convert), create,
// write, thumbnail. The queue drives these; every function here is a
// thin composition of existing API endpoints (plan §2 "Uploads": no new
// upload endpoint).

import type { FileKind, FileMeta } from "@/lib/api/client";
import { files as filesApi, staticSites } from "@/lib/api/client";
import {
  type ExcalidrawScene,
  parseExcalidrawScene,
  renderSceneThumb,
  sceneToStoredBlob,
} from "./excalidraw";
import { normalizeMarkdownSource } from "./textBlocks";
import type { PlannedJob } from "./types";

export type Prepared =
  | { kind: "excalidraw"; file: File; scene: ExcalidrawScene }
  | { kind: "drawio"; xml: string }
  | { kind: "notes"; source: string }
  | { kind: "static-site"; zip: Blob };

export class UploadError extends Error {}

/** Read and convert the job's content. Throws `UploadError` with a
 *  user-facing message when the content is invalid. */
export async function prepareJob(job: PlannedJob): Promise<Prepared> {
  const kind = job.kind;
  const first = job.entries[0]?.file;
  if (!kind || !first) throw new UploadError("Unsupported type");
  switch (kind) {
    case "excalidraw": {
      const scene = parseExcalidrawScene(await first.text());
      if (typeof scene === "string") throw new UploadError(scene);
      return { kind, file: first, scene };
    }
    case "drawio": {
      const xml = await first.text();
      if (!xml.trim()) throw new UploadError("Empty diagram");
      if (!/<mxfile[\s>]|<mxGraphModel[\s>]/.test(xml)) {
        throw new UploadError("Not a draw.io diagram");
      }
      return { kind, xml };
    }
    case "notes":
      return { kind, source: normalizeMarkdownSource(await first.text()) };
    case "static-site": {
      if (job.site === "zip") return { kind, zip: first };
      return { kind, zip: await zipEntries(job) };
    }
    default:
      throw new UploadError("Unsupported type");
  }
}

const COMPRESSIBLE = /\.(html?|css|m?js|json|svg|txt|md|xml|map|csv)$/i;

/** Directory sites and single HTML files are sent as a ZIP through the
 *  replace-all endpoint, so the site ends up with exactly the uploaded
 *  files (no leftover seed `index.html`) in one request; the worker
 *  keeps `index.html` as entry, else picks the shallowest `.html`. */
async function zipEntries(job: PlannedJob): Promise<Blob> {
  const { zipSync } = await import("fflate");
  const input: Record<string, [Uint8Array, { level: 0 | 6 }]> = {};
  for (const e of job.entries) {
    const path = job.site === "html" ? e.file.name : e.relativePath;
    input[path] = [
      new Uint8Array(await e.file.arrayBuffer()),
      { level: COMPRESSIBLE.test(path) ? 6 : 0 },
    ];
  }
  const bytes = zipSync(input);
  return new Blob([bytes as Uint8Array<ArrayBuffer>], { type: "application/zip" });
}

export interface CreatedFile {
  id: string;
  version: number;
  name: string;
  /** Content already written by the create call (excalidraw import). */
  written: boolean;
  meta: FileMeta;
}

/** Create the file row. Excalidraw goes through the import endpoint,
 *  which creates and writes in one request. */
export async function createForJob(
  prepared: Prepared,
  name: string,
  folderId: string | null,
): Promise<CreatedFile> {
  if (prepared.kind === "excalidraw") {
    const meta = await filesApi.importExcalidraw(prepared.file, { name, folderId });
    return { id: meta.id, version: meta.version, name: meta.name, written: true, meta };
  }
  const meta = await filesApi.create({ name, folderId, kind: prepared.kind });
  return { id: meta.id, version: meta.version, name: meta.name, written: false, meta };
}

/** Write the content into an existing file (freshly created, or the
 *  Replace target) with optimistic concurrency. */
export async function writeContent(
  prepared: Prepared,
  target: { id: string; version: number; name: string },
): Promise<FileMeta> {
  switch (prepared.kind) {
    case "excalidraw":
      return filesApi.save(
        target.id,
        target.version,
        sceneToStoredBlob(prepared.scene, target.name),
      );
    case "drawio":
      return filesApi.save(target.id, target.version, { kind: "drawio", xml: prepared.xml });
    case "notes":
      return filesApi.save(target.id, target.version, {
        kind: "notes",
        format: "markdown-v1",
        source: prepared.source,
      });
    case "static-site":
      return (await staticSites.uploadZip(target.id, prepared.zip, target.version)).meta;
  }
}

/** Best-effort thumbnail; `false` when the kind has none client-side
 *  (drawio needs its iframe — the editor backfills on first open). */
export async function writeThumb(prepared: Prepared, fileId: string): Promise<void> {
  let svg: string | null = null;
  if (prepared.kind === "excalidraw") {
    svg = await renderSceneThumb(prepared.scene);
  } else if (prepared.kind === "notes") {
    const { markdownToThumbSvg } = await import("@/features/editor/markdown/thumb");
    svg = markdownToThumbSvg(prepared.source);
  }
  if (svg) await filesApi.putThumb(fileId, svg);
}

export function hasClientThumb(kind: FileKind): boolean {
  return kind === "excalidraw" || kind === "notes";
}
