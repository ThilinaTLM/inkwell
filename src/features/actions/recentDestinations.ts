// Recent move destinations (localStorage `inkwell.recentDestinations`, max 6).
//
// PUBLIC CONTRACT
//   getRecentDestinations(): Array<string | null>   – folder ids, `null` = Home; newest first
//   pushRecentDestination(folderId: string | null)
//   useRecentDestinations(): Array<string | null>

import { createStore, useStore } from "@/lib/store";

const KEY = "inkwell.recentDestinations";
const MAX = 6;

function read(): Array<string | null> {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "[]") as unknown;
    return Array.isArray(raw)
      ? raw.filter((x): x is string | null => x === null || typeof x === "string").slice(0, MAX)
      : [];
  } catch {
    return [];
  }
}

const store = createStore<Array<string | null>>(typeof localStorage === "undefined" ? [] : read());

export function getRecentDestinations(): Array<string | null> {
  return store.get();
}

export function pushRecentDestination(folderId: string | null): void {
  const next = [folderId, ...store.get().filter((x) => x !== folderId)].slice(0, MAX);
  store.set(next);
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
}

export function useRecentDestinations(): Array<string | null> {
  return useStore(store);
}
