// Global selection store.
//
// PUBLIC CONTRACT
//   interface SelectionState { scope: string; items: ItemRef[]; focused: ItemRef | null }
//   selectionStore                      – the raw external store (createStore)
//   setSelection(next: Partial<SelectionState> & { scope?: string })
//   clearSelection(scope?)              – clears (only if `scope` matches, when given)
//   getSelection(): SelectionState
//   useSelection(): SelectionState      – React hook
//   useSelectionCount(): number
//   isSelected(ref, items) / refKey(ref) / parseRefKey("file:abc")
//
// `scope` identifies which surface owns the selection (e.g.
// "explorer:<folderId>", "recent", "trash", "shares"). The explorer
// (WS-C) owns anchor/range semantics and writes the resulting list
// here; commands, menus and the bulk bar read from it.

import type { ItemRef } from "@/lib/api/client";
import { createStore, useStore } from "@/lib/store";

export interface SelectionState {
  scope: string;
  items: ItemRef[];
  focused: ItemRef | null;
}

const EMPTY: SelectionState = { scope: "", items: [], focused: null };

export const selectionStore = createStore<SelectionState>(EMPTY);

export function getSelection(): SelectionState {
  return selectionStore.get();
}

export function setSelection(next: Partial<SelectionState>): void {
  selectionStore.set((prev) => ({ ...prev, ...next }));
}

export function clearSelection(scope?: string): void {
  selectionStore.set((prev) => {
    if (scope !== undefined && prev.scope !== scope) return prev;
    if (prev.items.length === 0 && prev.focused === null) return prev;
    return { ...prev, items: [], focused: null };
  });
}

export function useSelection(): SelectionState {
  return useStore(selectionStore);
}

export function useSelectionCount(): number {
  return useStore(selectionStore, (s) => s.items.length);
}

export function refKey(ref: ItemRef): string {
  return `${ref.type}:${ref.id}`;
}

export function parseRefKey(key: string): ItemRef | null {
  const m = /^(file|folder):(.+)$/.exec(key);
  return m ? { type: m[1] as ItemRef["type"], id: m[2] } : null;
}

export function sameRef(a: ItemRef | null | undefined, b: ItemRef | null | undefined): boolean {
  return !!a && !!b && a.type === b.type && a.id === b.id;
}

export function isSelected(ref: ItemRef, items: ItemRef[]): boolean {
  return items.some((r) => sameRef(r, ref));
}
