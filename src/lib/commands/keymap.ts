// Key binding parser / matcher / user overrides.
//
// PUBLIC CONTRACT (used by the registry, Settings → Shortcuts, menus):
//
//   Binding syntax (one string per binding; a command may have several):
//     "mod+shift+c"   modifiers joined with "+"; `mod` = ⌘ on mac, Ctrl elsewhere
//     "g h"           a 2-key chord: press `g`, release, then `h` (≤ 1.2 s)
//     "f2" "delete" "mod+backspace" "enter" "escape" "space" "?" "/" "1"
//     "mod+\\" "mod+=" "mod+-" "shift+s" "alt+enter" "arrowup"
//
//   parseBinding(str)                 → KeyCombo[] (one per chord step)
//   normalizeBinding(str)             → canonical string ("shift+mod+c" → "mod+shift+c")
//   eventToCombo(e, isMac?)           → KeyCombo for a KeyboardEvent-like object
//   comboMatches(combo, eventCombo)   → boolean
//   createChordMatcher()              → stateful matcher for chords (see below)
//   isSingleKeyBinding(str)           → true for bindings without ⌘/Ctrl/Alt (letters, digits, chords)
//   formatBinding(str, isMac?)        → "⌘⇧C" on mac, "Ctrl+Shift+C" elsewhere; chords "G H"
//   formatBindingParts(str, isMac?)   → ["⌘","⇧","C"] for <kbd> rendering
//   formatKeys(keys, isMac?)          → formats the first binding of a list ("" if none)
//
//   Overrides (localStorage `inkwell.keymap`, JSON { [commandId]: string[] }):
//   getKeyOverrides() / setKeyOverride(id, keys | null) (null = reset to default,
//   [] = explicitly unbound) / resetAllKeyOverrides() / useKeyOverridesVersion()
//
//   findConflicts(bindings?)          → [{ binding, ids }] where ≥2 commands share a
//                                        binding, or a chord prefix shadows a single key.
//                                        Defaults to the registry's effective bindings.

import { useSyncExternalStore } from "react";
import { createStore } from "@/lib/store";

export interface KeyCombo {
  key: string;
  mod: boolean;
  shift: boolean;
  alt: boolean;
  /** The "other" platform modifier: Ctrl on mac, Meta (Win key) elsewhere. */
  ctrl: boolean;
}

export interface KeyEventLike {
  key: string;
  code?: string;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}

export const isMacPlatform: boolean =
  typeof navigator !== "undefined" &&
  /mac|iphone|ipad|ipod/i.test(
    (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform ??
      navigator.platform ??
      "",
  );

const KEY_ALIASES: Record<string, string> = {
  esc: "escape",
  del: "delete",
  return: "enter",
  " ": "space",
  spacebar: "space",
  up: "arrowup",
  down: "arrowdown",
  left: "arrowleft",
  right: "arrowright",
  plus: "+",
  minus: "-",
  backslash: "\\",
  comma: ",",
  slash: "/",
  cmd: "mod",
  command: "mod",
  meta: "mod",
  option: "alt",
  opt: "alt",
  control: "ctrl",
};

// Characters produced with Shift on a US layout, so "?" matches
// Shift+/ without the binding needing an explicit "shift".
const SHIFTED_CHARS = new Set(`~!@#$%^&*()_+{}|:"<>?`.split(""));

// Keys that equal each other for matching purposes ("mod+=" should
// also fire for "mod++" since "+" is shift+= on most layouts).
const EQUIVALENT: Record<string, string> = { "+": "=", _: "-" };

function canonicalKey(k: string): string {
  const low = k.length === 1 ? k.toLowerCase() : k.toLowerCase();
  return KEY_ALIASES[low] ?? low;
}

/** Parse one combo like "mod+shift+c". A literal "+" key is written "plus" or "mod++". */
function parseCombo(raw: string): KeyCombo {
  const combo: KeyCombo = { key: "", mod: false, shift: false, alt: false, ctrl: false };
  let s = raw.trim();
  // Trailing "++" means the key itself is "+".
  if (s.endsWith("++")) {
    combo.key = "+";
    s = s.slice(0, -2);
  } else if (s === "+") {
    combo.key = "+";
    s = "";
  }
  const parts = s.split("+").filter(Boolean);
  for (const p of parts) {
    const c = canonicalKey(p);
    if (c === "mod") combo.mod = true;
    else if (c === "shift") combo.shift = true;
    else if (c === "alt") combo.alt = true;
    else if (c === "ctrl") combo.ctrl = true;
    else combo.key = c;
  }
  return combo;
}

export function parseBinding(binding: string): KeyCombo[] {
  const trimmed = binding.trim().toLowerCase();
  if (!trimmed) return [];
  // A lone space-separated sequence is a chord; "space" is a named key.
  return trimmed.split(/\s+/).map(parseCombo);
}

function comboToString(c: KeyCombo): string {
  const parts: string[] = [];
  if (c.mod) parts.push("mod");
  if (c.ctrl) parts.push("ctrl");
  if (c.alt) parts.push("alt");
  if (c.shift) parts.push("shift");
  parts.push(c.key === "+" ? "plus" : c.key);
  return parts.join("+");
}

export function normalizeBinding(binding: string): string {
  return parseBinding(binding).map(comboToString).join(" ");
}

/** Convert a keyboard event into a combo, folding ⌘/Ctrl into `mod`. */
export function eventToCombo(e: KeyEventLike, isMac: boolean = isMacPlatform): KeyCombo {
  let key = e.key ?? "";
  // With Alt held, mac produces dead/special characters (⌥N → "˜");
  // fall back to the physical key for letters and digits.
  if (e.altKey && e.code) {
    const m = /^Key([A-Z])$/.exec(e.code) ?? /^Digit(\d)$/.exec(e.code);
    if (m) key = m[1];
  }
  key = canonicalKey(key);
  return {
    key,
    mod: isMac ? e.metaKey : e.ctrlKey,
    ctrl: isMac ? e.ctrlKey : e.metaKey,
    alt: e.altKey,
    shift: e.shiftKey,
  };
}

function keysEqual(a: string, b: string): boolean {
  if (a === b) return true;
  return (EQUIVALENT[a] ?? a) === (EQUIVALENT[b] ?? b);
}

/** Does the pressed combo satisfy the bound combo? */
export function comboMatches(bound: KeyCombo, pressed: KeyCombo): boolean {
  if (!keysEqual(bound.key, pressed.key)) return false;
  if (bound.mod !== pressed.mod || bound.alt !== pressed.alt || bound.ctrl !== pressed.ctrl) {
    return false;
  }
  // Shifted punctuation ("?", "+") implies shift; don't require it to be spelled out.
  if (SHIFTED_CHARS.has(pressed.key) || SHIFTED_CHARS.has(bound.key)) return true;
  // "mod+=" should fire whether or not shift was held to produce "+".
  if (bound.key === "=" || bound.key === "-") return true;
  return bound.shift === pressed.shift;
}

const MODIFIER_KEYS = new Set(["shift", "alt", "control", "ctrl", "meta", "mod", "os", "capslock"]);

export function isModifierOnly(combo: KeyCombo): boolean {
  return MODIFIER_KEYS.has(combo.key) || combo.key === "";
}

/** True when a binding can be typed without ⌘/Ctrl/Alt (subject to the
 *  "single-key shortcuts" preference). F-keys, Delete, Escape and Enter
 *  are not considered single-key: they don't clash with typing. */
export function isSingleKeyBinding(binding: string): boolean {
  const combos = parseBinding(binding);
  if (combos.length === 0) return false;
  if (combos.length > 1) return true;
  const c = combos[0];
  if (c.mod || c.alt || c.ctrl) return false;
  if (/^f\d{1,2}$/.test(c.key)) return false;
  if (["delete", "escape", "enter", "tab"].includes(c.key)) return false;
  return true;
}

// ─── Chord matching ────────────────────────────────────────────────────

export interface ChordBinding {
  id: string;
  combos: KeyCombo[];
}

export type ChordResult = { type: "match"; id: string } | { type: "pending" } | { type: "none" };

/**
 * Stateful matcher. Call `feed(combo, now)` for every non-modifier
 * keydown. A 2-step chord ("g h") returns `pending` after `g` and
 * `match` after `h` if it arrives within `timeoutMs`. Single-step
 * bindings match immediately unless the same key also starts a chord
 * (in which case the chord wins; single-key fallback is not delayed —
 * `findConflicts` reports those clashes instead).
 */
export function createChordMatcher(timeoutMs = 1200) {
  let pending: { combos: KeyCombo[]; at: number } | null = null;
  return {
    reset() {
      pending = null;
    },
    get isPending() {
      return pending !== null;
    },
    feed(bindings: ChordBinding[], pressed: KeyCombo, now: number = Date.now()): ChordResult {
      if (isModifierOnly(pressed)) return { type: pending ? "pending" : "none" };
      if (pending && now - pending.at > timeoutMs) pending = null;
      if (pending) {
        const prefix = pending.combos;
        pending = null;
        for (const b of bindings) {
          if (b.combos.length !== prefix.length + 1) continue;
          const ok =
            prefix.every((c, i) => comboMatches(b.combos[i], c)) &&
            comboMatches(b.combos[prefix.length], pressed);
          if (ok) return { type: "match", id: b.id };
        }
        // Fall through: treat this key as a fresh press.
      }
      const startsChord = bindings.some(
        (b) => b.combos.length > 1 && comboMatches(b.combos[0], pressed),
      );
      if (startsChord) {
        pending = { combos: [pressed], at: now };
        return { type: "pending" };
      }
      for (const b of bindings) {
        if (b.combos.length === 1 && comboMatches(b.combos[0], pressed)) {
          return { type: "match", id: b.id };
        }
      }
      return { type: "none" };
    },
  };
}

// ─── Formatting ────────────────────────────────────────────────────────

const MAC_GLYPH: Record<string, string> = {
  mod: "⌘",
  ctrl: "⌃",
  alt: "⌥",
  shift: "⇧",
};
const PC_NAME: Record<string, string> = { mod: "Ctrl", ctrl: "Win", alt: "Alt", shift: "Shift" };

const KEY_LABEL: Record<string, string> = {
  enter: "↵",
  escape: "Esc",
  backspace: "⌫",
  delete: "Del",
  space: "Space",
  arrowup: "↑",
  arrowdown: "↓",
  arrowleft: "←",
  arrowright: "→",
  tab: "Tab",
  "\\": "\\",
  "=": "+",
  "-": "−",
  pageup: "PgUp",
  pagedown: "PgDn",
};

function keyLabel(key: string, isMac: boolean): string {
  if (!isMac && key === "backspace") return "Backspace";
  if (!isMac && key === "enter") return "Enter";
  if (KEY_LABEL[key]) return KEY_LABEL[key];
  if (/^f\d{1,2}$/.test(key)) return key.toUpperCase();
  return key.length === 1 ? key.toUpperCase() : key[0].toUpperCase() + key.slice(1);
}

function comboParts(c: KeyCombo, isMac: boolean): string[] {
  const parts: string[] = [];
  const order: (keyof typeof MAC_GLYPH)[] = isMac
    ? ["ctrl", "alt", "shift", "mod"]
    : ["mod", "ctrl", "alt", "shift"];
  for (const m of order) {
    if (c[m as "mod" | "ctrl" | "alt" | "shift"]) parts.push(isMac ? MAC_GLYPH[m] : PC_NAME[m]);
  }
  parts.push(keyLabel(c.key, isMac));
  return parts;
}

/** Parts for <kbd> rendering. Chord steps are separated by a " " entry. */
export function formatBindingParts(binding: string, isMac: boolean = isMacPlatform): string[] {
  const out: string[] = [];
  parseBinding(binding).forEach((c, i) => {
    if (i > 0) out.push(" ");
    out.push(...comboParts(c, isMac));
  });
  return out;
}

export function formatBinding(binding: string, isMac: boolean = isMacPlatform): string {
  return parseBinding(binding)
    .map((c) => comboParts(c, isMac).join(isMac ? "" : "+"))
    .join(" ");
}

export function formatKeys(keys: string[] | string | undefined, isMac?: boolean): string {
  const first = Array.isArray(keys) ? keys[0] : keys;
  return first ? formatBinding(first, isMac) : "";
}

// ─── Overrides ─────────────────────────────────────────────────────────

export const KEYMAP_STORAGE_KEY = "inkwell.keymap";

export type KeyOverrides = Record<string, string[]>;

function readOverrides(): KeyOverrides {
  try {
    const raw = localStorage.getItem(KEYMAP_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    const out: KeyOverrides = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (Array.isArray(v) && v.every((x) => typeof x === "string")) out[k] = v as string[];
    }
    return out;
  } catch {
    return {};
  }
}

const overridesStore = createStore<{ overrides: KeyOverrides; version: number }>({
  overrides: typeof localStorage === "undefined" ? {} : readOverrides(),
  version: 0,
});

if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key !== KEYMAP_STORAGE_KEY) return;
    overridesStore.set((s) => ({ overrides: readOverrides(), version: s.version + 1 }));
  });
}

export function getKeyOverrides(): KeyOverrides {
  return overridesStore.get().overrides;
}

function writeOverrides(next: KeyOverrides) {
  try {
    localStorage.setItem(KEYMAP_STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* storage unavailable — keep in memory */
  }
  overridesStore.set((s) => ({ overrides: next, version: s.version + 1 }));
}

/** `null` resets to the command's default keys; `[]` unbinds it. */
export function setKeyOverride(id: string, keys: string[] | null): void {
  const next = { ...getKeyOverrides() };
  if (keys === null) delete next[id];
  else next[id] = keys.map(normalizeBinding).filter(Boolean);
  writeOverrides(next);
}

export function resetAllKeyOverrides(): void {
  writeOverrides({});
}

export function subscribeKeyOverrides(listener: () => void): () => void {
  return overridesStore.subscribe(listener);
}

/** Re-render when overrides change; returns a version counter. */
export function useKeyOverridesVersion(): number {
  return useSyncExternalStore(
    overridesStore.subscribe,
    () => overridesStore.get().version,
    () => 0,
  );
}

// ─── Conflicts ─────────────────────────────────────────────────────────

export interface KeyConflict {
  binding: string;
  ids: string[];
}

let bindingsProvider: (() => Record<string, string[]>) | null = null;

/** Registry hook-up so `findConflicts()` can default to live bindings
 *  without keymap.ts importing the registry (avoids an import cycle). */
export function setBindingsProvider(fn: () => Record<string, string[]>): void {
  bindingsProvider = fn;
}

export function findConflicts(bindings?: Record<string, string[]>): KeyConflict[] {
  const src = bindings ?? bindingsProvider?.() ?? {};
  const byBinding = new Map<string, Set<string>>();
  for (const [id, keys] of Object.entries(src)) {
    for (const k of keys) {
      const n = normalizeBinding(k);
      if (!n) continue;
      const set = byBinding.get(n) ?? new Set<string>();
      set.add(id);
      byBinding.set(n, set);
    }
  }
  const out: KeyConflict[] = [];
  for (const [binding, ids] of byBinding) {
    if (ids.size > 1) out.push({ binding, ids: [...ids].sort() });
  }
  // Single keys that are also the first step of a chord are unreachable.
  for (const [binding, ids] of byBinding) {
    const steps = binding.split(" ");
    if (steps.length < 2) continue;
    const prefixIds = byBinding.get(steps[0]);
    if (prefixIds) {
      out.push({ binding: steps[0], ids: [...new Set([...prefixIds, ...ids])].sort() });
    }
  }
  return out;
}
