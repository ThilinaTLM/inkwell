// Pure helpers for the bulk item endpoints, Trash and Duplicate.
//
// No D1, no R2, no Hono — everything here works on plain maps so the
// rules (ancestor de-duplication, cycle/depth checks, copy naming, purge
// dates, trash paths) are unit-testable in isolation (see items.test.ts).

export type ItemType = "file" | "folder";
export interface ItemRef {
  type: ItemType;
  id: string;
}

/** Max refs accepted by any `/api/items/*` endpoint (mirrors the client's
 *  `MAX_BULK_ITEMS`). */
export const MAX_BULK_ITEMS = 500;

/** Items stay in Trash this long before the daily cron purges them. */
export const TRASH_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

export function purgeAtFor(deletedAt: number): number {
  return deletedAt + TRASH_RETENTION_MS;
}

/** Cutoff for `purgeExpired(now)`: anything deleted at or before this is due. */
export function purgeCutoff(nowMs: number): number {
  return nowMs - TRASH_RETENTION_MS;
}

// ─── Folder tree walks over an in-memory parent map ─────────────────
/** folder id → parent folder id (`null` = root). */
export type ParentMap = ReadonlyMap<string, string | null>;

/** `[startId, parent, grandparent, …]`, stopping at the root, at an id
 *  missing from the map, or on a (corrupt-data) loop. */
export function chainUp(parentOf: ParentMap, startId: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  let cur: string | null | undefined = startId;
  while (cur && parentOf.has(cur) && !seen.has(cur)) {
    seen.add(cur);
    out.push(cur);
    cur = parentOf.get(cur);
  }
  return out;
}

/** Nesting depth of a folder: a root-level folder has depth 1. */
export function depthOf(parentOf: ParentMap, id: string): number {
  return chainUp(parentOf, id).length;
}

export function childrenMap(parentOf: ParentMap): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const [id, parent] of parentOf) {
    if (!parent) continue;
    const arr = out.get(parent);
    if (arr) arr.push(id);
    else out.set(parent, [id]);
  }
  return out;
}

/** Depth of the subtree rooted at `rootId` (a leaf folder is 1). */
export function subtreeDepth(children: ReadonlyMap<string, string[]>, rootId: string): number {
  let max = 0;
  const stack: [string, number][] = [[rootId, 1]];
  const seen = new Set<string>();
  while (stack.length > 0) {
    const next = stack.pop();
    if (!next) break;
    const [id, d] = next;
    if (seen.has(id)) continue;
    seen.add(id);
    if (d > max) max = d;
    for (const c of children.get(id) ?? []) stack.push([c, d + 1]);
  }
  return max;
}

/** All folder ids in the subtree rooted at `rootId`, root included. */
export function subtreeIds(children: ReadonlyMap<string, string[]>, rootId: string): string[] {
  const out: string[] = [];
  const stack = [rootId];
  const seen = new Set<string>();
  while (stack.length > 0) {
    const id = stack.pop();
    if (id === undefined || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
    for (const c of children.get(id) ?? []) stack.push(c);
  }
  return out;
}

export type FolderMoveProblem = "cycle" | "depth";

/** Validate moving folder `folderId` under `targetId` (`null` = root).
 *  Shared by `PATCH /api/folders/:id` and `POST /api/items/move`. */
export function checkFolderMove(
  parentOf: ParentMap,
  folderId: string,
  targetId: string | null,
  maxDepth: number,
): FolderMoveProblem | null {
  if (targetId === null) return null;
  if (targetId === folderId) return "cycle";
  if (chainUp(parentOf, targetId).includes(folderId)) return "cycle";
  const children = childrenMap(parentOf);
  if (depthOf(parentOf, targetId) + subtreeDepth(children, folderId) > maxDepth) return "depth";
  return null;
}

// ─── Ref de-duplication ──────────────────────────────────────────────
/**
 * Drop exact duplicates, then drop every ref whose ancestor folder is
 * also in the batch: acting on the folder already covers it (trashing,
 * moving or duplicating `A` and `A/B` together must not treat `B` twice).
 * Order of the surviving refs is preserved.
 *
 * `fileFolder` maps file id → containing folder id (`null` = root).
 */
export function dedupeByAncestor(
  refs: readonly ItemRef[],
  parentOf: ParentMap,
  fileFolder: ReadonlyMap<string, string | null>,
): ItemRef[] {
  const seen = new Set<string>();
  const unique: ItemRef[] = [];
  for (const r of refs) {
    const key = `${r.type}:${r.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(r);
  }
  const batchFolders = new Set(unique.filter((r) => r.type === "folder").map((r) => r.id));
  if (batchFolders.size === 0) return unique;
  return unique.filter((r) => {
    const start = r.type === "folder" ? parentOf.get(r.id) : fileFolder.get(r.id);
    if (!start) return true;
    return !chainUp(parentOf, start).some((a) => batchFolders.has(a));
  });
}

// ─── Copy naming ─────────────────────────────────────────────────────
const COPY_SUFFIX_RE = /^(.*) \(copy(?: (\d+))?\)$/;
const MAX_NAME = 200;

/**
 * `"X"` → `"X (copy)"`, then `"X (copy 2)"`, `"X (copy 3)"`, … — the
 * first variant not in `taken`. Duplicating a copy doesn't stack
 * suffixes: `"X (copy)"` → `"X (copy 2)"`. The base is truncated so the
 * result fits the 200-char name limit.
 */
export function copyName(name: string, taken: ReadonlySet<string>): string {
  const m = COPY_SUFFIX_RE.exec(name);
  const base = m?.[1] ? m[1] : name;
  for (let n = 1; ; n++) {
    const suffix = n === 1 ? " (copy)" : ` (copy ${n})`;
    const candidate = base.slice(0, MAX_NAME - suffix.length) + suffix;
    if (!taken.has(candidate)) return candidate;
  }
}

// ─── Trash paths ─────────────────────────────────────────────────────
/** Human-readable location of an item whose parent is `parentId`:
 *  `"Home"` for the root, `"Home / A / B"` when the parent is `B` inside
 *  `A`. Ancestors missing from `nameOf` are skipped. */
export function locationPath(
  parentOf: ParentMap,
  nameOf: ReadonlyMap<string, string>,
  parentId: string | null,
): string {
  const parts = ["Home"];
  if (parentId) {
    const chain = chainUp(parentOf, parentId).reverse();
    for (const id of chain) {
      const n = nameOf.get(id);
      if (n !== undefined) parts.push(n);
    }
  }
  return parts.join(" / ");
}
