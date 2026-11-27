// Device-local layout preference for <ItemCollection>: "cards" or "list"
// (localStorage `inkwell.explorer.collectionLayout`, cross-tab synced via
// the `storage` event). Remembered per device, not per folder.
//
//   type CollectionLayout = "cards" | "list"
//   getCollectionLayout() / setCollectionLayout(layout)
//   useCollectionLayout(): [CollectionLayout, (l: CollectionLayout) => void]

import { useCallback, useSyncExternalStore } from "react";

export type CollectionLayout = "cards" | "list";

const STORAGE_KEY = "inkwell.explorer.collectionLayout";
const DEFAULT_LAYOUT: CollectionLayout = "cards";

const listeners = new Set<() => void>();
let cached: CollectionLayout | null = null;

function isLayout(v: unknown): v is CollectionLayout {
  return v === "cards" || v === "list";
}

export function getCollectionLayout(): CollectionLayout {
  if (cached) return cached;
  let value: CollectionLayout = DEFAULT_LAYOUT;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed: unknown = raw == null ? undefined : JSON.parse(raw);
    if (isLayout(parsed)) value = parsed;
  } catch {
    /* storage unavailable or malformed — use the default */
  }
  cached = value;
  return value;
}

export function setCollectionLayout(layout: CollectionLayout): void {
  cached = layout;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(layout));
  } catch {
    /* in-memory only */
  }
  for (const l of listeners) l();
}

function subscribe(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key !== STORAGE_KEY) return;
    cached = null;
    for (const l of listeners) l();
  });
}

export function useCollectionLayout(): [CollectionLayout, (layout: CollectionLayout) => void] {
  const layout = useSyncExternalStore(subscribe, getCollectionLayout, () => DEFAULT_LAYOUT);
  return [layout, useCallback((l: CollectionLayout) => setCollectionLayout(l), [])];
}
