// Pure helpers shared by the static-site editor pieces: path encoding,
// byte formatting, the text/image/binary split that decides how a file
// opens, the folder tree built from the flat asset list, and the
// first-run template.

import type { StaticSiteAsset } from "@/lib/api/client";

/** Percent-encode each path segment without touching the slashes. */
export function encodePath(p: string): string {
  return p.split("/").map(encodeURIComponent).join("/");
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

export function baseName(path: string): string {
  return path.split("/").pop() || path;
}

const TEXT_EXT = new Set([
  "html",
  "htm",
  "xhtml",
  "css",
  "js",
  "mjs",
  "cjs",
  "ts",
  "tsx",
  "jsx",
  "json",
  "map",
  "xml",
  "svg",
  "txt",
  "md",
  "markdown",
  "yaml",
  "yml",
  "toml",
  "csv",
  "webmanifest",
]);
const IMAGE_EXT = new Set(["png", "jpg", "jpeg", "gif", "webp", "avif", "ico", "bmp", "svg"]);
/** Above this we refuse to load into the editor — it would stall the tab. */
export const MAX_EDITABLE_BYTES = 2 * 1024 * 1024;

function ext(path: string): string {
  const b = baseName(path).toLowerCase();
  const dot = b.lastIndexOf(".");
  return dot === -1 ? "" : b.slice(dot + 1);
}

export function isTextAsset(a: Pick<StaticSiteAsset, "path" | "contentType">): boolean {
  if (TEXT_EXT.has(ext(a.path))) return true;
  return /^text\//.test(a.contentType) || /json|xml|javascript/.test(a.contentType);
}

export function isImageAsset(a: Pick<StaticSiteAsset, "path">): boolean {
  return IMAGE_EXT.has(ext(a.path));
}

export function isHtmlPath(path: string): boolean {
  return /\.(x?html?)$/i.test(path);
}

export type TreeNode =
  | { type: "dir"; name: string; path: string; children: TreeNode[] }
  | { type: "file"; name: string; path: string; asset: StaticSiteAsset };

/** Build a folder tree (dirs first, then files, each alphabetical). */
export function buildTree(assets: StaticSiteAsset[]): TreeNode[] {
  const root: TreeNode[] = [];
  for (const asset of assets) {
    const parts = asset.path.split("/");
    let level = root;
    let acc = "";
    for (let i = 0; i < parts.length - 1; i++) {
      acc = acc ? `${acc}/${parts[i]}` : parts[i];
      let dir = level.find((n): n is Extract<TreeNode, { type: "dir" }> => {
        return n.type === "dir" && n.path === acc;
      });
      if (!dir) {
        dir = { type: "dir", name: parts[i], path: acc, children: [] };
        level.push(dir);
      }
      level = dir.children;
    }
    level.push({ type: "file", name: parts[parts.length - 1], path: asset.path, asset });
  }
  const sort = (nodes: TreeNode[]) => {
    nodes.sort((a, b) =>
      a.type === b.type ? a.name.localeCompare(b.name) : a.type === "dir" ? -1 : 1,
    );
    for (const n of nodes) if (n.type === "dir") sort(n.children);
  };
  sort(root);
  return root;
}

export const TEMPLATE_HTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Untitled page</title>
    <style>
      body {
        font-family: system-ui, sans-serif;
        max-width: 40rem;
        margin: 4rem auto;
        padding: 0 1.25rem;
        line-height: 1.6;
        color: #1c1814;
      }
    </style>
  </head>
  <body>
    <h1>Hello, world</h1>
    <p>Edit this page in the Files tab, or upload your own site.</p>
  </body>
</html>
`;
