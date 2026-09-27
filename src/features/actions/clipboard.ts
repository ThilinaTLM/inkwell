// Item clipboard (cut / copy → paste) — client-only, not the OS clipboard.
//
// PUBLIC CONTRACT
//   interface ItemClipboard { mode: "cut" | "copy" | null; items: ItemRef[] }
//   clipboardStore
//   setClipboard(mode, items) / clearClipboard() / getClipboard()
//   useClipboard(): ItemClipboard
//   useIsCut(ref): boolean      – for dimming cut items in views

import type { ItemRef } from "@/lib/api/client";
import { createStore, useStore } from "@/lib/store";

export interface ItemClipboard {
  mode: "cut" | "copy" | null;
  items: ItemRef[];
}

export const clipboardStore = createStore<ItemClipboard>({ mode: null, items: [] });

export function setClipboard(mode: "cut" | "copy", items: ItemRef[]): void {
  clipboardStore.set({ mode, items: [...items] });
}

export function clearClipboard(): void {
  clipboardStore.set({ mode: null, items: [] });
}

export function getClipboard(): ItemClipboard {
  return clipboardStore.get();
}

export function useClipboard(): ItemClipboard {
  return useStore(clipboardStore);
}

export function useIsCut(ref: ItemRef): boolean {
  return useStore(
    clipboardStore,
    (s) => s.mode === "cut" && s.items.some((r) => r.type === ref.type && r.id === ref.id),
  );
}
