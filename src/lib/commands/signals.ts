// Signals for commands whose behaviour lives in a page (the explorer).
//
// PUBLIC CONTRACT
//   quickLookStore: Store<{ open: boolean; item: ItemRef | null; nonce: number }>
//   requestQuickLook(item | null)  – `item.quickLook` (Space) toggles this; the explorer
//                                    renders the overlay and closes it via
//                                    quickLookStore.set({ ...s, open: false }).
//   useQuickLookRequest()
//   emitCommandSignal(id, detail?) – dispatches `window` CustomEvent "inkwell:command"
//                                    with detail { id, ...detail }. Default `run` of
//                                    page-owned commands (select.all, select.none, …) emits
//                                    this; a page can either listen for it or override the
//                                    command by registering the same id (the registry
//                                    stacks registrations; the newest wins).
//   onCommandSignal(id, handler): () => void

import type { ItemRef } from "@/lib/api/client";
import { createStore, useStore } from "@/lib/store";

export const quickLookStore = createStore<{
  open: boolean;
  item: ItemRef | null;
  nonce: number;
}>({ open: false, item: null, nonce: 0 });

export function requestQuickLook(item: ItemRef | null): void {
  quickLookStore.set((s) => ({
    open: !s.open || (!!item && s.item?.id !== item.id),
    item,
    nonce: s.nonce + 1,
  }));
}

export function useQuickLookRequest() {
  return useStore(quickLookStore);
}

export const COMMAND_SIGNAL_EVENT = "inkwell:command";

export function emitCommandSignal(id: string, detail: Record<string, unknown> = {}): void {
  window.dispatchEvent(new CustomEvent(COMMAND_SIGNAL_EVENT, { detail: { id, ...detail } }));
}

export function onCommandSignal(
  id: string,
  handler: (detail: Record<string, unknown>) => void,
): () => void {
  const listener = (e: Event) => {
    const d = (e as CustomEvent<{ id: string } & Record<string, unknown>>).detail;
    if (d?.id === id) handler(d);
  };
  window.addEventListener(COMMAND_SIGNAL_EVENT, listener);
  return () => window.removeEventListener(COMMAND_SIGNAL_EVENT, listener);
}
