// React bindings for the pure list-selection model (./selectionModel).
//
// PUBLIC CONTRACT
//   useLocalSelState(): [ListSel, set]          – component-local (shares, users, invites)
//   useItemSelState(scope): [ListSel, set]      – backed by the global selection store
//                                                 (`src/lib/selection.ts`) under `scope`, keys
//                                                 are `refKey(ItemRef)` ("file:abc"), so item
//                                                 commands / menus / ⌘Z act on it
//   useListSelection(order, [state, set]): ListSelectionApi
//   interface ListSelectionApi {
//     sel; order; count; selectedKeys: string[]; isSelected(k)
//     onRowClick(k, e)   – click / ⌘-click / ⇧-click
//     onRowContextMenu(k) – selects `k` first unless it is already selected
//     toggle(k) / toggleAll() / selectAll() / clear() / setOnly(k)
//     onKeyDown(e)       – ↑/↓/Home/End (+⇧), Space toggles focus, ⌘A, Esc
//   }
//   Keys no longer in `order` are pruned automatically; the focused row is scrolled into view.

import {
  type KeyboardEvent,
  type MouseEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { onCommandSignal } from "@/lib/commands/signals";
import { parseRefKey, refKey, setSelection, useSelection } from "@/lib/selection";
import {
  clickSelect,
  EMPTY_SEL,
  jumpFocus,
  type ListSel,
  moveFocus,
  pruneSel,
  selectAllKeys,
  toggleKey,
} from "./selectionModel";

type SelStore = readonly [ListSel, (next: ListSel) => void];

export function useLocalSelState(): SelStore {
  const [s, set] = useState<ListSel>(EMPTY_SEL);
  return [s, set] as const;
}

export function useItemSelState(scope: string): SelStore {
  const global = useSelection();
  const anchor = useRef<string | null>(null);
  const state = useMemo<ListSel>(() => {
    if (global.scope !== scope) return EMPTY_SEL;
    return {
      selected: global.items.map(refKey),
      focus: global.focused ? refKey(global.focused) : null,
      anchor: anchor.current,
    };
  }, [global, scope]);
  const set = useCallback(
    (next: ListSel) => {
      anchor.current = next.anchor;
      setSelection({
        scope,
        items: next.selected.map(parseRefKey).filter((r) => r !== null),
        focused: next.focus ? parseRefKey(next.focus) : null,
      });
    },
    [scope],
  );
  return [state, set] as const;
}

export interface ListSelectionApi {
  sel: ListSel;
  order: readonly string[];
  count: number;
  selectedKeys: string[];
  isSelected(key: string): boolean;
  onRowClick(key: string, e: MouseEvent): void;
  onRowContextMenu(key: string): void;
  toggle(key: string): void;
  toggleAll(): void;
  selectAll(): void;
  clear(): void;
  setOnly(key: string): void;
  onKeyDown(e: KeyboardEvent): void;
}

export function useListSelection(
  order: readonly string[],
  [sel, set]: SelStore,
  opts: { listenSelectAll?: boolean } = {},
): ListSelectionApi {
  const latest = useRef({ sel, order, set });
  latest.current = { sel, order, set };

  // Drop keys that disappeared (restored / revoked / filtered out).
  useEffect(() => {
    const pruned = pruneSel(sel, order);
    if (pruned !== sel) set(pruned);
  }, [sel, order, set]);

  // Keep the focused row visible.
  useEffect(() => {
    if (!sel.focus) return;
    const el = document.querySelector(`[data-row-key="${CSS.escape(sel.focus)}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [sel.focus]);

  useEffect(() => {
    if (!opts.listenSelectAll) return;
    return onCommandSignal("select.all", () => {
      const { order: o, set: s } = latest.current;
      s(selectAllKeys(o));
    });
  }, [opts.listenSelectAll]);

  return useMemo<ListSelectionApi>(() => {
    const selectedSet = new Set(sel.selected);
    return {
      sel,
      order,
      count: sel.selected.length,
      selectedKeys: sel.selected,
      isSelected: (k) => selectedSet.has(k),
      onRowClick: (k, e) =>
        set(clickSelect(sel, order, k, { toggle: e.metaKey || e.ctrlKey, range: e.shiftKey })),
      onRowContextMenu: (k) => {
        if (!selectedSet.has(k)) set({ selected: [k], anchor: k, focus: k });
        else if (sel.focus !== k) set({ ...sel, focus: k });
      },
      toggle: (k) => set(toggleKey(sel, k)),
      toggleAll: () =>
        set(
          sel.selected.length === order.length && order.length ? EMPTY_SEL : selectAllKeys(order),
        ),
      selectAll: () => set(selectAllKeys(order)),
      clear: () => set(EMPTY_SEL),
      setOnly: (k) => set({ selected: [k], anchor: k, focus: k }),
      onKeyDown: (e) => {
        const mod = e.metaKey || e.ctrlKey;
        let next: ListSel | null = null;
        switch (e.key) {
          case "ArrowDown":
            next = moveFocus(sel, order, 1, e.shiftKey);
            break;
          case "ArrowUp":
            next = moveFocus(sel, order, -1, e.shiftKey);
            break;
          case "Home":
            next = jumpFocus(sel, order, "start", e.shiftKey);
            break;
          case "End":
            next = jumpFocus(sel, order, "end", e.shiftKey);
            break;
          case "PageDown":
            next = moveFocus(sel, order, 10, e.shiftKey);
            break;
          case "PageUp":
            next = moveFocus(sel, order, -10, e.shiftKey);
            break;
          case " ":
            if (sel.focus && !mod) next = toggleKey(sel, sel.focus);
            break;
          case "a":
          case "A":
            if (mod && !e.shiftKey && !e.altKey) next = selectAllKeys(order);
            break;
          case "Escape":
            if (sel.selected.length) next = EMPTY_SEL;
            break;
        }
        if (next) {
          e.preventDefault();
          e.stopPropagation();
          set(next);
        }
      },
    };
  }, [sel, order, set]);
}
