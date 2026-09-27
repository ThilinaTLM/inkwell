// Explorer client state glued onto the global selection store.
//
// PUBLIC CONTRACT
//   getSelState(scope): SelState                 – keys view of the global selection
//   dispatchSelection(scope, action)             – runs the pure reducer and writes the
//                                                  result into `src/lib/selection.ts`
//   useIsItemSelected(scope, key) / useIsItemFocused(scope, key)
//   useSelectedKeys(scope): string[]
//   renameStore / startRename(scope, key) / stopRename() / useRenaming(scope, key)
//   requestPendingSelection(keys) / takePendingSelection()
//       – set before navigating so the next page commit selects these keys
//         (AppShell only keeps a selection written during the new route's commit).

import { getSelection, parseRefKey, refKey, selectionStore, setSelection } from "@/lib/selection";
import { createStore, useStore } from "@/lib/store";
import { EMPTY_SEL, type SelAction, type SelState, selectionReducer } from "./selection-logic";

const anchors = new Map<string, string | null>();

export function getSelState(scope: string): SelState {
  const s = getSelection();
  if (s.scope !== scope) return EMPTY_SEL;
  return {
    selected: s.items.map(refKey),
    anchor: anchors.get(scope) ?? null,
    focus: s.focused ? refKey(s.focused) : null,
  };
}

export function dispatchSelection(scope: string, action: SelAction): SelState {
  const prev = getSelState(scope);
  const next = selectionReducer(prev, action);
  if (next === prev && getSelection().scope === scope) return prev;
  anchors.set(scope, next.anchor);
  setSelection({
    scope,
    items: next.selected.map((k) => parseRefKey(k)).filter((r) => r !== null),
    focused: next.focus ? parseRefKey(next.focus) : null,
  });
  return next;
}

export function useIsItemSelected(scope: string, key: string): boolean {
  return useStore(
    selectionStore,
    (s) => s.scope === scope && s.items.some((r) => `${r.type}:${r.id}` === key),
  );
}

export function useIsItemFocused(scope: string, key: string): boolean {
  return useStore(
    selectionStore,
    (s) => s.scope === scope && !!s.focused && `${s.focused.type}:${s.focused.id}` === key,
  );
}

const EMPTY: string[] = [];
let cacheItems: unknown = null;
let cacheKeys: string[] = EMPTY;

export function useSelectedKeys(scope: string): string[] {
  return useStore(selectionStore, (s) => {
    if (s.scope !== scope || s.items.length === 0) return EMPTY;
    if (s.items !== cacheItems) {
      cacheItems = s.items;
      cacheKeys = s.items.map(refKey);
    }
    return cacheKeys;
  });
}

// ─── Inline rename ──────────────────────────────────────────────────────

export const renameStore = createStore<{ scope: string; key: string } | null>(null);

export function startRename(scope: string, key: string): void {
  renameStore.set({ scope, key });
}

export function stopRename(): void {
  renameStore.set(null);
}

export function useRenaming(scope: string, key: string): boolean {
  return useStore(renameStore, (r) => !!r && r.scope === scope && r.key === key);
}

// ─── Pending selection across navigation ────────────────────────────────

let pending: string[] | null = null;

export function requestPendingSelection(keys: string[]): void {
  pending = keys;
}

export function takePendingSelection(): string[] | null {
  const p = pending;
  pending = null;
  return p;
}
