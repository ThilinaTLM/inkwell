// Tiny external store for client-only UI state (selection, clipboard,
// upload queue, undo stack). Built on `useSyncExternalStore` so there is
// no extra state library; server data stays in TanStack Query.
//
//   const counter = createStore({ n: 0 });
//   counter.set((s) => ({ n: s.n + 1 }));
//   const n = useStore(counter, (s) => s.n);

import { useSyncExternalStore } from "react";

export interface Store<T> {
  get(): T;
  set(next: T | ((prev: T) => T)): void;
  subscribe(listener: () => void): () => void;
}

export function createStore<T>(initial: T): Store<T> {
  let state = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => state,
    set(next) {
      const value = typeof next === "function" ? (next as (prev: T) => T)(state) : next;
      if (Object.is(value, state)) return;
      state = value;
      for (const l of listeners) l();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

/** Subscribe to a store. `selector` must return a stable value (a
 *  primitive or a reference already held in the state) to avoid
 *  re-render loops. */
export function useStore<T, S = T>(store: Store<T>, selector?: (state: T) => S): S {
  const select = selector ?? ((s: T) => s as unknown as S);
  return useSyncExternalStore(
    store.subscribe,
    () => select(store.get()),
    () => select(store.get()),
  );
}
