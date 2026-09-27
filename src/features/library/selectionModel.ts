// Pure list-selection reducer shared by every dense table outside the
// explorer (library pages, Shared links, Users, Invites).
//
// PUBLIC CONTRACT
//   interface ListSel { selected: string[]; anchor: string | null; focus: string | null }
//   EMPTY_SEL
//   clickSelect(state, order, key, { toggle, range }): ListSel
//       plain click → only `key`; toggle (⌘/Ctrl) → add/remove; range (⇧) → anchor..key
//   toggleKey(state, key): ListSel             – checkbox semantics
//   moveFocus(state, order, delta, extend): ListSel   – ↑/↓ (+⇧ extends from the anchor)
//   jumpFocus(state, order, "start" | "end", extend): ListSel
//   selectAllKeys(order): ListSel
//   pruneSel(state, order): ListSel            – drops keys that are no longer listed

export interface ListSel {
  selected: string[];
  anchor: string | null;
  focus: string | null;
}

export const EMPTY_SEL: ListSel = { selected: [], anchor: null, focus: null };

function range(order: readonly string[], a: string, b: string): string[] {
  const i = order.indexOf(a);
  const j = order.indexOf(b);
  if (i < 0 || j < 0) return [b];
  const [lo, hi] = i <= j ? [i, j] : [j, i];
  return order.slice(lo, hi + 1);
}

export function clickSelect(
  state: ListSel,
  order: readonly string[],
  key: string,
  mods: { toggle?: boolean; range?: boolean } = {},
): ListSel {
  if (mods.range && state.anchor && order.includes(state.anchor)) {
    const r = range(order, state.anchor, key);
    const selected = mods.toggle ? [...new Set([...state.selected, ...r])] : r;
    return { selected, anchor: state.anchor, focus: key };
  }
  if (mods.toggle) return toggleKey(state, key);
  return { selected: [key], anchor: key, focus: key };
}

export function toggleKey(state: ListSel, key: string): ListSel {
  const has = state.selected.includes(key);
  return {
    selected: has ? state.selected.filter((k) => k !== key) : [...state.selected, key],
    anchor: key,
    focus: key,
  };
}

export function moveFocus(
  state: ListSel,
  order: readonly string[],
  delta: number,
  extend: boolean,
): ListSel {
  if (!order.length) return state;
  const cur = state.focus ? order.indexOf(state.focus) : -1;
  const nextIdx =
    cur < 0
      ? delta > 0
        ? 0
        : order.length - 1
      : Math.max(0, Math.min(order.length - 1, cur + delta));
  return focusAt(state, order, order[nextIdx], extend);
}

export function jumpFocus(
  state: ListSel,
  order: readonly string[],
  where: "start" | "end",
  extend: boolean,
): ListSel {
  if (!order.length) return state;
  return focusAt(state, order, where === "start" ? order[0] : order[order.length - 1], extend);
}

function focusAt(state: ListSel, order: readonly string[], key: string, extend: boolean): ListSel {
  if (extend) {
    const anchor = state.anchor && order.includes(state.anchor) ? state.anchor : key;
    return { selected: range(order, anchor, key), anchor, focus: key };
  }
  return { selected: [key], anchor: key, focus: key };
}

export function selectAllKeys(order: readonly string[]): ListSel {
  return {
    selected: [...order],
    anchor: order[0] ?? null,
    focus: order[order.length - 1] ?? null,
  };
}

export function pruneSel(state: ListSel, order: readonly string[]): ListSel {
  const set = new Set(order);
  const selected = state.selected.filter((k) => set.has(k));
  const focus = state.focus && set.has(state.focus) ? state.focus : null;
  const anchor = state.anchor && set.has(state.anchor) ? state.anchor : null;
  if (
    selected.length === state.selected.length &&
    focus === state.focus &&
    anchor === state.anchor
  ) {
    return state;
  }
  return { selected, anchor, focus };
}
