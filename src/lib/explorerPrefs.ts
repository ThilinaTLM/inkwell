// Device-local explorer preferences (localStorage `inkwell.explorer.*`,
// cross-tab synced via the `storage` event, same spirit as preferences.ts).
//
// PUBLIC CONTRACT
//   type ExplorerView = "grid" | "compact" | "list" | "columns"
//   type ThumbSize = "s" | "m" | "l" | "xl"
//   type SortKey = "name" | "modified" | "created" | "size" | "kind"
//   interface SortPref { key: SortKey; dir: "asc" | "desc" }
//   type ListColumn = "name" | "kind" | "modified" | "created" | "size" | "tags" | "location" | "shared"
//
//   interface ExplorerPrefs {
//     defaultView: ExplorerView;                 // "grid"
//     thumbSize: ThumbSize;                      // "m"
//     sort: SortPref;                            // { key: "name", dir: "asc" }
//     foldersFirst: boolean;                     // true
//     detailsPanel: "hidden" | "remember" | "always";   // "remember"
//     openWith: "double" | "single";             // "double"
//     openFilesIn: "same" | "new";               // "same"
//     altDrag: "duplicate" | "ask";              // "duplicate"
//     uploadConflict: "ask" | "keepBoth" | "replace";   // "ask"
//     confirmTrash: boolean;                     // false
//     singleKeyShortcuts: boolean;               // true
//     listColumns: ListColumn[];                 // ["name","modified","size","tags"]
//     listColumnWidths: Partial<Record<ListColumn, number>>;  // {}
//   }
//
//   EXPLORER_PREF_DEFAULTS
//   getExplorerPref(key) / setExplorerPref(key, value) / resetExplorerPref(key)
//   useExplorerPref(key): [value, setValue]
//   useFolderView(viewKey: string | null): [ExplorerView, (v: ExplorerView) => void]
//       per-folder view memory (LRU of 200), falls back to `defaultView`.
//       `viewKey` = folder id, `null` = Home; library pages use `route:/recent` etc.
//       (see `viewKeyFor(ctx)`).
//   getFolderView(viewKey) / setFolderView(viewKey, view)
//   hasFolderView(viewKey): boolean – true when the user picked a view for this key
//   viewKeyFor({ currentFolderId, route }): string
//   THUMB_SIZES (ordered) / stepThumbSize(size, +1 | -1)
//   lruSet(entries, key, value, max) – pure helper (tested)

import { useCallback, useSyncExternalStore } from "react";

export type ExplorerView = "grid" | "compact" | "list" | "columns";
export type ThumbSize = "s" | "m" | "l" | "xl";
export type SortKey = "name" | "modified" | "created" | "size" | "kind";
export interface SortPref {
  key: SortKey;
  dir: "asc" | "desc";
}
export type ListColumn =
  | "name"
  | "kind"
  | "modified"
  | "created"
  | "size"
  | "tags"
  | "location"
  | "shared";

export interface ExplorerPrefs {
  defaultView: ExplorerView;
  thumbSize: ThumbSize;
  sort: SortPref;
  foldersFirst: boolean;
  detailsPanel: "hidden" | "remember" | "always";
  openWith: "double" | "single";
  openFilesIn: "same" | "new";
  altDrag: "duplicate" | "ask";
  uploadConflict: "ask" | "keepBoth" | "replace";
  confirmTrash: boolean;
  singleKeyShortcuts: boolean;
  listColumns: ListColumn[];
  listColumnWidths: Partial<Record<ListColumn, number>>;
}

export type ExplorerPrefKey = keyof ExplorerPrefs;

export const EXPLORER_PREF_DEFAULTS: ExplorerPrefs = {
  defaultView: "grid",
  thumbSize: "m",
  sort: { key: "name", dir: "asc" },
  foldersFirst: true,
  detailsPanel: "remember",
  openWith: "double",
  openFilesIn: "same",
  altDrag: "duplicate",
  uploadConflict: "ask",
  confirmTrash: false,
  singleKeyShortcuts: true,
  listColumns: ["name", "modified", "size", "tags"],
  listColumnWidths: {},
};

const PREFIX = "inkwell.explorer.";
const FOLDER_VIEWS_KEY = `${PREFIX}folderViews`;
export const FOLDER_VIEW_LRU_MAX = 200;

export const THUMB_SIZES: ThumbSize[] = ["s", "m", "l", "xl"];
const VIEWS: ExplorerView[] = ["grid", "compact", "list", "columns"];

export function stepThumbSize(size: ThumbSize, delta: 1 | -1): ThumbSize {
  const i = THUMB_SIZES.indexOf(size);
  return THUMB_SIZES[Math.max(0, Math.min(THUMB_SIZES.length - 1, (i < 0 ? 1 : i) + delta))];
}

// ─── Validation ────────────────────────────────────────────────────────

function isValid<K extends ExplorerPrefKey>(key: K, v: unknown): v is ExplorerPrefs[K] {
  const d = EXPLORER_PREF_DEFAULTS[key];
  if (Array.isArray(d)) return Array.isArray(v) && v.every((x) => typeof x === "string");
  if (typeof d === "boolean") return typeof v === "boolean";
  if (key === "sort") {
    const s = v as SortPref;
    return (
      !!s &&
      typeof s === "object" &&
      ["name", "modified", "created", "size", "kind"].includes(s.key) &&
      (s.dir === "asc" || s.dir === "desc")
    );
  }
  if (key === "listColumnWidths") return !!v && typeof v === "object" && !Array.isArray(v);
  const allowed: Partial<Record<ExplorerPrefKey, readonly string[]>> = {
    defaultView: VIEWS,
    thumbSize: THUMB_SIZES,
    detailsPanel: ["hidden", "remember", "always"],
    openWith: ["double", "single"],
    openFilesIn: ["same", "new"],
    altDrag: ["duplicate", "ask"],
    uploadConflict: ["ask", "keepBoth", "replace"],
  };
  const list = allowed[key];
  return !!list && typeof v === "string" && list.includes(v);
}

// ─── Storage-backed cache with subscribers ─────────────────────────────

const cache = new Map<string, unknown>();
const listeners = new Map<string, Set<() => void>>();

function storageKey(key: string) {
  return key.startsWith(PREFIX) ? key : PREFIX + key;
}

function readRaw(fullKey: string): unknown {
  try {
    const raw = localStorage.getItem(fullKey);
    return raw == null ? undefined : JSON.parse(raw);
  } catch {
    return undefined;
  }
}

function writeRaw(fullKey: string, value: unknown) {
  try {
    if (value === undefined) localStorage.removeItem(fullKey);
    else localStorage.setItem(fullKey, JSON.stringify(value));
  } catch {
    /* storage unavailable — in-memory only */
  }
}

function notify(fullKey: string) {
  for (const l of listeners.get(fullKey) ?? []) l();
}

function subscribeKey(fullKey: string, l: () => void): () => void {
  const set = listeners.get(fullKey) ?? new Set();
  set.add(l);
  listeners.set(fullKey, set);
  return () => set.delete(l);
}

if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (!e.key?.startsWith(PREFIX)) return;
    cache.delete(e.key);
    notify(e.key);
  });
}

export function getExplorerPref<K extends ExplorerPrefKey>(key: K): ExplorerPrefs[K] {
  const fk = storageKey(key);
  if (cache.has(fk)) return cache.get(fk) as ExplorerPrefs[K];
  const raw = readRaw(fk);
  const v = isValid(key, raw) ? raw : EXPLORER_PREF_DEFAULTS[key];
  cache.set(fk, v);
  return v;
}

export function setExplorerPref<K extends ExplorerPrefKey>(key: K, value: ExplorerPrefs[K]): void {
  const fk = storageKey(key);
  cache.set(fk, value);
  writeRaw(fk, value);
  notify(fk);
}

export function resetExplorerPref(key: ExplorerPrefKey): void {
  const fk = storageKey(key);
  cache.delete(fk);
  writeRaw(fk, undefined);
  notify(fk);
}

export function subscribeExplorerPref(key: ExplorerPrefKey, l: () => void): () => void {
  return subscribeKey(storageKey(key), l);
}

export function useExplorerPref<K extends ExplorerPrefKey>(
  key: K,
): [ExplorerPrefs[K], (v: ExplorerPrefs[K]) => void] {
  const fk = storageKey(key);
  const value = useSyncExternalStore(
    useCallback((l: () => void) => subscribeKey(fk, l), [fk]),
    () => getExplorerPref(key),
    () => EXPLORER_PREF_DEFAULTS[key],
  );
  const set = useCallback((v: ExplorerPrefs[K]) => setExplorerPref(key, v), [key]);
  return [value, set];
}

// ─── Per-folder view memory (LRU) ──────────────────────────────────────

export type LruEntries<V> = Array<[string, V]>;

/** Pure: moves/inserts `key` to the most-recent end and trims to `max`. */
export function lruSet<V>(
  entries: LruEntries<V>,
  key: string,
  value: V,
  max: number,
): LruEntries<V> {
  const next = entries.filter(([k]) => k !== key);
  next.push([key, value]);
  return next.length > max ? next.slice(next.length - max) : next;
}

function readFolderViews(): LruEntries<ExplorerView> {
  if (cache.has(FOLDER_VIEWS_KEY)) return cache.get(FOLDER_VIEWS_KEY) as LruEntries<ExplorerView>;
  const raw = readRaw(FOLDER_VIEWS_KEY);
  const v = Array.isArray(raw)
    ? (raw as unknown[]).filter(
        (e): e is [string, ExplorerView] =>
          Array.isArray(e) && typeof e[0] === "string" && VIEWS.includes(e[1] as ExplorerView),
      )
    : [];
  cache.set(FOLDER_VIEWS_KEY, v);
  return v;
}

function normViewKey(viewKey: string | null): string {
  return viewKey ?? "root";
}

export function getFolderView(viewKey: string | null): ExplorerView {
  const k = normViewKey(viewKey);
  const hit = readFolderViews().find(([id]) => id === k);
  return hit ? hit[1] : getExplorerPref("defaultView");
}

export function hasFolderView(viewKey: string | null): boolean {
  const k = normViewKey(viewKey);
  return readFolderViews().some(([id]) => id === k);
}

export function setFolderView(viewKey: string | null, view: ExplorerView): void {
  const next = lruSet(readFolderViews(), normViewKey(viewKey), view, FOLDER_VIEW_LRU_MAX);
  cache.set(FOLDER_VIEWS_KEY, next);
  writeRaw(FOLDER_VIEWS_KEY, next);
  notify(FOLDER_VIEWS_KEY);
}

export function useFolderView(viewKey: string | null): [ExplorerView, (v: ExplorerView) => void] {
  const subscribe = useCallback((l: () => void) => {
    const a = subscribeKey(FOLDER_VIEWS_KEY, l);
    const b = subscribeKey(storageKey("defaultView"), l);
    return () => {
      a();
      b();
    };
  }, []);
  const view = useSyncExternalStore(
    subscribe,
    () => getFolderView(viewKey),
    () => EXPLORER_PREF_DEFAULTS.defaultView,
  );
  const set = useCallback((v: ExplorerView) => setFolderView(viewKey, v), [viewKey]);
  return [view, set];
}

/** The view-memory key for a command context: folder id, "root" for
 *  Home, or `route:<pathname>` for non-folder pages. */
export function viewKeyFor(ctx: {
  currentFolderId: string | null | undefined;
  route: string;
}): string | null {
  if (ctx.currentFolderId !== undefined) return ctx.currentFolderId;
  return `route:${ctx.route}`;
}
