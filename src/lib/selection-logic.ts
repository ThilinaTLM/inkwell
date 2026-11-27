// Pure selection + keyboard-focus logic for the explorer views.
// No React, no DOM — unit-tested in selection-logic.test.ts.
//
// PUBLIC CONTRACT
//   interface SelState { selected: string[]; anchor: string | null; focus: string | null }
//   type SelAction =
//     | { type: "click"; key; mod?; shift?; order }          – mouse click semantics
//     | { type: "focus"; key; shift?; mod?; order }          – keyboard focus move
//     | { type: "selectAll"; order } | { type: "clear" }
//     | { type: "set"; keys; focus? }
//     | { type: "marquee"; hits; base; mode: "replace" | "add" | "toggle" }
//     | { type: "prune"; order }                             – drop keys no longer listed
//   selectionReducer(state, action): SelState
//   type NavLayout =
//     | { type: "list" }
//     | { type: "grid"; sections: { start: number; count: number; cols: number }[] }
//     | { type: "flow"; rows: number }                       – compact column flow
//   type NavKey = "up" | "down" | "left" | "right" | "home" | "end" | "pageUp" | "pageDown"
//   nextIndex(index, key, layout, count, pageSize?): number
//   rangeKeys(order, a, b): string[]

export interface SelState {
  selected: string[];
  anchor: string | null;
  focus: string | null;
}

export const EMPTY_SEL: SelState = { selected: [], anchor: null, focus: null };

export type SelAction =
  | { type: "click"; key: string; mod?: boolean; shift?: boolean; order: readonly string[] }
  | { type: "focus"; key: string; shift?: boolean; mod?: boolean; order: readonly string[] }
  | { type: "selectAll"; order: readonly string[] }
  | { type: "clear" }
  | { type: "set"; keys: readonly string[]; focus?: string | null }
  | {
      type: "marquee";
      hits: readonly string[];
      base: readonly string[];
      mode: "replace" | "add" | "toggle";
    }
  | { type: "prune"; order: readonly string[] };

export function rangeKeys(order: readonly string[], a: string, b: string): string[] {
  const i = order.indexOf(a);
  const j = order.indexOf(b);
  if (i < 0 || j < 0) return j >= 0 ? [b] : [];
  const [lo, hi] = i <= j ? [i, j] : [j, i];
  return order.slice(lo, hi + 1);
}

function uniq(keys: readonly string[]): string[] {
  return [...new Set(keys)];
}

export function selectionReducer(state: SelState, action: SelAction): SelState {
  switch (action.type) {
    case "click": {
      const { key, order } = action;
      if (action.shift) {
        const anchor = state.anchor && order.includes(state.anchor) ? state.anchor : key;
        const range = rangeKeys(order, anchor, key);
        // ⌘⇧-click adds the range to the existing selection.
        const selected = action.mod ? uniq([...state.selected, ...range]) : range;
        return { selected, anchor, focus: key };
      }
      if (action.mod) {
        const has = state.selected.includes(key);
        const selected = has ? state.selected.filter((k) => k !== key) : [...state.selected, key];
        return { selected, anchor: key, focus: key };
      }
      return { selected: [key], anchor: key, focus: key };
    }
    case "focus": {
      const { key, order } = action;
      if (action.shift) {
        const anchor =
          state.anchor && order.includes(state.anchor) ? state.anchor : (state.focus ?? key);
        return { selected: rangeKeys(order, anchor, key), anchor, focus: key };
      }
      // ⌘+arrow moves focus without changing the selection.
      if (action.mod) return { ...state, focus: key };
      return { selected: [key], anchor: key, focus: key };
    }
    case "selectAll":
      return {
        selected: [...action.order],
        anchor: state.anchor ?? action.order[0] ?? null,
        focus: state.focus ?? action.order[0] ?? null,
      };
    case "clear":
      return state.selected.length ? { ...state, selected: [] } : state;
    case "set": {
      const selected = uniq(action.keys);
      const focus = action.focus !== undefined ? action.focus : (selected[0] ?? null);
      return { selected, anchor: focus, focus };
    }
    case "marquee": {
      let selected: string[];
      if (action.mode === "add") selected = uniq([...action.base, ...action.hits]);
      else if (action.mode === "toggle") {
        const hit = new Set(action.hits);
        const base = new Set(action.base);
        selected = [
          ...action.base.filter((k) => !hit.has(k)),
          ...action.hits.filter((k) => !base.has(k)),
        ];
      } else selected = [...action.hits];
      const last = action.hits[action.hits.length - 1] ?? state.focus;
      return { selected, anchor: action.hits[0] ?? state.anchor, focus: last ?? null };
    }
    case "prune": {
      const set = new Set(action.order);
      const selected = state.selected.filter((k) => set.has(k));
      const anchor = state.anchor && set.has(state.anchor) ? state.anchor : null;
      const focus = state.focus && set.has(state.focus) ? state.focus : null;
      if (
        selected.length === state.selected.length &&
        anchor === state.anchor &&
        focus === state.focus
      )
        return state;
      return { selected, anchor, focus };
    }
  }
}

// ─── Keyboard navigation ────────────────────────────────────────────────

export type NavLayout =
  | { type: "list" }
  | { type: "grid"; sections: Array<{ start: number; count: number; cols: number }> }
  | { type: "flow"; rows: number };

export type NavKey = "up" | "down" | "left" | "right" | "home" | "end" | "pageUp" | "pageDown";

export function navKeyFromEvent(key: string): NavKey | null {
  switch (key) {
    case "ArrowUp":
      return "up";
    case "ArrowDown":
      return "down";
    case "ArrowLeft":
      return "left";
    case "ArrowRight":
      return "right";
    case "Home":
      return "home";
    case "End":
      return "end";
    case "PageUp":
      return "pageUp";
    case "PageDown":
      return "pageDown";
    default:
      return null;
  }
}

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

/** Next focus index. `index` < 0 means "nothing focused yet": any key
 *  lands on the first item (End → last). */
export function nextIndex(
  index: number,
  key: NavKey,
  layout: NavLayout,
  count: number,
  pageSize = 10,
): number {
  if (count <= 0) return -1;
  if (index < 0 || index >= count) return key === "end" ? count - 1 : 0;
  if (key === "home") return 0;
  if (key === "end") return count - 1;

  if (layout.type === "list") {
    if (key === "up") return clamp(index - 1, 0, count - 1);
    if (key === "down") return clamp(index + 1, 0, count - 1);
    if (key === "pageUp") return clamp(index - pageSize, 0, count - 1);
    if (key === "pageDown") return clamp(index + pageSize, 0, count - 1);
    return index; // ←/→ do nothing in a single column
  }

  if (layout.type === "flow") {
    const rows = Math.max(1, layout.rows);
    if (key === "up") return clamp(index - 1, 0, count - 1);
    if (key === "down") return clamp(index + 1, 0, count - 1);
    if (key === "left" || key === "pageUp") return index - rows >= 0 ? index - rows : 0;
    if (key === "right" || key === "pageDown")
      return index + rows < count ? index + rows : count - 1;
    return index;
  }

  // Grid with sections (e.g. "Folders" and "Files" blocks).
  const sections = layout.sections.filter((s) => s.count > 0);
  const si = sections.findIndex((s) => index >= s.start && index < s.start + s.count);
  if (si < 0) return clamp(index, 0, count - 1);
  const sec = sections[si];
  const cols = Math.max(1, sec.cols);
  const local = index - sec.start;
  const row = Math.floor(local / cols);
  const col = local % cols;
  const lastRow = Math.floor((sec.count - 1) / cols);

  if (key === "left") return clamp(index - 1, 0, count - 1);
  if (key === "right") return clamp(index + 1, 0, count - 1);
  if (key === "up" || key === "pageUp") {
    const steps = key === "pageUp" ? Math.max(1, Math.floor(pageSize / cols)) : 1;
    if (row - steps >= 0) return sec.start + (row - steps) * cols + col;
    if (si === 0) return key === "pageUp" ? sec.start + col : index;
    const prev = sections[si - 1];
    const pcols = Math.max(1, prev.cols);
    const pLastRow = Math.floor((prev.count - 1) / pcols);
    return prev.start + Math.min(pLastRow * pcols + Math.min(col, pcols - 1), prev.count - 1);
  }
  // down / pageDown
  const steps = key === "pageDown" ? Math.max(1, Math.floor(pageSize / cols)) : 1;
  if (row + steps <= lastRow)
    return sec.start + Math.min((row + steps) * cols + col, sec.count - 1);
  if (si === sections.length - 1) {
    // Last row: jump to the last item only when a shorter row sits below.
    return row < lastRow ? sec.start + sec.count - 1 : index;
  }
  const next = sections[si + 1];
  return next.start + Math.min(col, Math.max(1, next.cols) - 1, next.count - 1);
}
