// Global keyboard dispatcher for registry commands.
//
// PUBLIC CONTRACT
//   useGlobalHotkeys(): void   – mount ONCE, in AppShell (never on editor routes)
//   shouldIgnoreHotkeyTarget(target): boolean
//
// Behaviour:
//   - ignores events from inputs/textareas/selects/contenteditable,
//     and while any dialog / alertdialog / menu / listbox popup is open
//     (base-ui popups carry these roles) — except the explorer's own
//     `role="listbox"` pane, which is marked `data-hotkeys="allow"`.
//   - elements (or ancestors) with `data-hotkeys="off"` opt out.
//   - honours the `singleKeyShortcuts` explorer pref: when off, bindings
//     without ⌘/Ctrl/Alt (letters, digits, chords) are skipped.
//   - commands whose `when(ctx)` is false are skipped, so the same key
//     can be bound to different commands on different surfaces.
//   - `preventDefault()` only when a command actually runs (or a chord
//     is pending), so native shortcuts keep working otherwise.

import { useEffect } from "react";
import { getExplorerPref } from "@/lib/explorerPrefs";
import {
  type ChordBinding,
  createChordMatcher,
  eventToCombo,
  isSingleKeyBinding,
  parseBinding,
} from "./keymap";
import {
  getCommand,
  getCommandContext,
  getCommands,
  getEffectiveKeys,
  isCommandAvailable,
  runCommand,
} from "./registry";

// Popups that are animating out carry `data-closed` (base-ui) and must
// not swallow the next shortcut.
const OPEN_POPUP_SELECTOR = [
  '[role="dialog"]:not([data-closed])',
  '[role="alertdialog"]:not([data-closed])',
  '[role="menu"]:not([data-closed])',
  '[data-slot="select-content"]:not([data-closed])',
].join(",");

export function shouldIgnoreHotkeyTarget(target: EventTarget | null): boolean {
  const el = target instanceof Element ? target : null;
  if (el) {
    if (el.closest('[data-hotkeys="off"]')) return true;
    const tag = el.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
    if ((el as HTMLElement).isContentEditable) return true;
  }
  if (typeof document !== "undefined" && document.querySelector(OPEN_POPUP_SELECTOR)) return true;
  return false;
}

export function useGlobalHotkeys(): void {
  useEffect(() => {
    const matcher = createChordMatcher();

    function onKeyDown(e: KeyboardEvent) {
      if (e.defaultPrevented || e.isComposing) return;
      if (shouldIgnoreHotkeyTarget(e.target)) {
        matcher.reset();
        return;
      }
      const ctx = getCommandContext();
      const singleKeysOn = getExplorerPref("singleKeyShortcuts");
      const bindings: ChordBinding[] = [];
      for (const cmd of getCommands()) {
        if (!isCommandAvailable(cmd, ctx)) continue;
        for (const k of getEffectiveKeys(cmd.id)) {
          const single = cmd.singleKey ?? isSingleKeyBinding(k);
          if (single && !singleKeysOn) continue;
          bindings.push({ id: cmd.id, combos: parseBinding(k) });
        }
      }
      const res = matcher.feed(bindings, eventToCombo(e));
      if (res.type === "pending") {
        e.preventDefault();
        return;
      }
      if (res.type !== "match") return;
      const cmd = getCommand(res.id);
      if (!cmd) return;
      if (cmd.disabledReason?.(ctx)) return;
      e.preventDefault();
      e.stopPropagation();
      runCommand(res.id);
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}
