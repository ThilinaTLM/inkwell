// Client-side classification of dropped / picked files.
//
// Pure: `classifyName`, `sniffMatches` and `planEntries` take plain data
// so they can be unit-tested; `classifyEntries` is the async wrapper that
// reads the few files whose kind depends on their content (`.json`,
// `.xml`) and then plans.
//
// Rules (plan WS-D §1):
//   .excalidraw, .json with an `elements` array      → excalidraw
//   .drawio, .xml / .drawio.xml with <mxfile|<mxGraphModel → drawio
//   .md, .markdown, .txt                               → notes
//   .zip, a single .html/.htm, or a directory whose top
//   level contains index.html                          → static-site
//   anything else                                      → unsupported (listed)
// Other directories are mirrored as folders; their files are classified
// with the same rules.

import type { FileKind } from "@/lib/api/client";
import { stripExtension } from "./naming";
import type { DroppedEntry, PlannedJob, SiteSource } from "./types";

/** Mirrors `MAX_FILE_BYTES` / `MAX_SITE_ASSET_BYTES` in the worker. */
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
/** Mirrors `MAX_SITE_TOTAL_BYTES` (a .zip or a whole directory site). */
export const MAX_SITE_TOTAL_BYTES = 100 * 1024 * 1024;
/** Mirrors `MAX_SITE_ASSET_COUNT`. */
export const MAX_SITE_FILES = 500;

export type Sniff = "excalidraw-json" | "drawio-xml";

export interface NameClass {
  kind: FileKind | null;
  /** The kind is only confirmed after looking at the content. */
  sniff?: Sniff;
  site?: SiteSource;
}

/** Classify by file name alone. */
export function classifyName(filename: string): NameClass {
  const n = filename.toLowerCase();
  if (n.endsWith(".excalidraw")) return { kind: "excalidraw" };
  if (n.endsWith(".json")) return { kind: "excalidraw", sniff: "excalidraw-json" };
  if (n.endsWith(".drawio")) return { kind: "drawio" };
  if (n.endsWith(".xml")) return { kind: "drawio", sniff: "drawio-xml" };
  if (n.endsWith(".md") || n.endsWith(".markdown") || n.endsWith(".txt")) return { kind: "notes" };
  if (n.endsWith(".zip")) return { kind: "static-site", site: "zip" };
  if (n.endsWith(".html") || n.endsWith(".htm")) return { kind: "static-site", site: "html" };
  return { kind: null };
}

/** Content check for names that need one. */
export function sniffMatches(sniff: Sniff, text: string): boolean {
  if (sniff === "drawio-xml") return /<mxfile[\s>]|<mxGraphModel[\s>]/.test(text);
  try {
    const parsed: unknown = JSON.parse(text);
    return (
      typeof parsed === "object" &&
      parsed !== null &&
      !Array.isArray(parsed) &&
      Array.isArray((parsed as { elements?: unknown }).elements)
    );
  } catch {
    return false;
  }
}

/** OS junk that is never worth a row. */
export function isJunkPath(path: string): boolean {
  const segs = path.split("/");
  const base = segs[segs.length - 1] ?? "";
  return (
    segs.includes("__MACOSX") ||
    base === ".DS_Store" ||
    base === "Thumbs.db" ||
    base === "desktop.ini" ||
    base.startsWith("._")
  );
}

function normalizePath(p: string): string {
  return p
    .replace(/\\/g, "/")
    .split("/")
    .filter((s) => s && s !== ".")
    .join("/");
}

export function formatMb(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

interface DirNode {
  name: string;
  files: DroppedEntry[];
  dirs: Map<string, DirNode>;
}

function newDir(name: string): DirNode {
  return { name, files: [], dirs: new Map() };
}

function allFiles(node: DirNode, prefix: string, out: DroppedEntry[]): DroppedEntry[] {
  for (const f of node.files) {
    const base = f.relativePath.split("/").pop() ?? f.file.name;
    out.push({ file: f.file, relativePath: prefix ? `${prefix}/${base}` : base });
  }
  for (const d of node.dirs.values()) allFiles(d, prefix ? `${prefix}/${d.name}` : d.name, out);
  return out;
}

function isSiteDir(node: DirNode): boolean {
  return node.files.some((f) => /(^|\/)index\.html?$/i.test(f.relativePath));
}

function planSingle(
  entry: DroppedEntry,
  dirPath: string[],
  sniffed: (entry: DroppedEntry) => boolean | undefined,
): PlannedJob {
  const label = entry.file.name;
  const cls = classifyName(label);
  const base: Omit<PlannedJob, "kind" | "name"> = { label, dirPath, entries: [entry] };
  if (!cls.kind) {
    const ext = /\.[^./]+$/.exec(label)?.[0];
    return {
      ...base,
      kind: null,
      name: stripExtension(label),
      reason: ext ? `Unsupported type (${ext})` : "Unsupported type",
    };
  }
  const limit = cls.site === "zip" ? MAX_SITE_TOTAL_BYTES : MAX_UPLOAD_BYTES;
  if (entry.file.size > limit) {
    return {
      ...base,
      kind: cls.kind,
      name: stripExtension(label),
      reason: `Too large (${formatMb(entry.file.size)}, limit ${formatMb(limit)})`,
    };
  }
  if (cls.sniff && sniffed(entry) === false) {
    return {
      ...base,
      kind: null,
      name: stripExtension(label),
      reason:
        cls.sniff === "drawio-xml"
          ? "Unsupported type (.xml is not a draw.io diagram)"
          : "Unsupported type (.json is not an Excalidraw scene)",
    };
  }
  return {
    ...base,
    kind: cls.kind,
    name: stripExtension(label),
    ...(cls.site ? { site: cls.site } : {}),
  };
}

function planSite(node: DirNode, dirPath: string[]): PlannedJob {
  const entries = allFiles(node, "", []);
  const job: PlannedJob = {
    kind: "static-site",
    label: `${node.name}/`,
    name: node.name.slice(0, 200) || "Untitled site",
    dirPath,
    entries,
    site: "dir",
  };
  const big = entries.find((e) => e.file.size > MAX_UPLOAD_BYTES);
  const total = entries.reduce((n, e) => n + e.file.size, 0);
  if (big) {
    job.reason = `${big.relativePath} is too large (limit ${formatMb(MAX_UPLOAD_BYTES)})`;
  } else if (total > MAX_SITE_TOTAL_BYTES) {
    job.reason = `Site too large (${formatMb(total)}, limit ${formatMb(MAX_SITE_TOTAL_BYTES)})`;
  } else if (entries.length > MAX_SITE_FILES) {
    job.reason = `Too many files (${entries.length}, limit ${MAX_SITE_FILES})`;
  }
  return job;
}

/**
 * Turn a flat list of dropped entries into upload jobs. `sniffed`
 * reports the content check for entries whose name needs one
 * (`undefined` = unknown, treated as a match).
 */
export function planEntries(
  entries: DroppedEntry[],
  sniffed: (entry: DroppedEntry) => boolean | undefined = () => undefined,
): PlannedJob[] {
  const root = newDir("");
  for (const e of entries) {
    const path = normalizePath(e.relativePath || e.file.name);
    if (!path || isJunkPath(path)) continue;
    const segs = path.split("/");
    let node = root;
    for (const seg of segs.slice(0, -1)) {
      let next = node.dirs.get(seg);
      if (!next) {
        next = newDir(seg);
        node.dirs.set(seg, next);
      }
      node = next;
    }
    node.files.push({ file: e.file, relativePath: path });
  }

  const jobs: PlannedJob[] = [];
  const walk = (node: DirNode, dirPath: string[]) => {
    for (const f of node.files) jobs.push(planSingle(f, dirPath, sniffed));
    for (const d of node.dirs.values()) {
      if (isSiteDir(d)) jobs.push(planSite(d, dirPath));
      else walk(d, [...dirPath, d.name]);
    }
  };
  walk(root, []);
  return jobs;
}

/** Read the content of entries that need sniffing, then plan. */
export async function classifyEntries(entries: DroppedEntry[]): Promise<PlannedJob[]> {
  const results = new Map<DroppedEntry, boolean>();
  await Promise.all(
    entries.map(async (e) => {
      const cls = classifyName(e.file.name);
      if (!cls.sniff || e.file.size > MAX_UPLOAD_BYTES) return;
      try {
        results.set(e, sniffMatches(cls.sniff, await e.file.text()));
      } catch {
        results.set(e, false);
      }
    }),
  );
  // `planEntries` re-wraps entries; map back by File identity.
  const byFile = new Map<File, boolean>();
  for (const [e, ok] of results) byFile.set(e.file, ok);
  return planEntries(entries, (e) => byFile.get(e.file));
}
