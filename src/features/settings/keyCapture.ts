// Pure helpers for Settings → Shortcuts click-to-rebind.
//
// PUBLIC CONTRACT
//   comboToBinding(combo: KeyCombo): string | null   – "mod+shift+k", "g", "f2"; null for
//                                                       modifier-only presses
//   canStartChord(binding): boolean                   – a plain letter/digit may become "g h"
//   conflictsFor(id, binding, effective): string[]    – other command ids already bound to
//                                                       `binding` (exact match, or a chord /
//                                                       single-key prefix clash)

import { isModifierOnly, type KeyCombo, normalizeBinding } from "@/lib/commands/keymap";

export function comboToBinding(c: KeyCombo): string | null {
  if (isModifierOnly(c)) return null;
  const parts: string[] = [];
  if (c.mod) parts.push("mod");
  if (c.ctrl) parts.push("ctrl");
  if (c.alt) parts.push("alt");
  // Shifted punctuation ("?") already implies shift.
  if (c.shift && !/^[~!@#$%^&*()_+{}|:"<>?]$/.test(c.key)) parts.push("shift");
  parts.push(c.key === "+" ? "plus" : c.key);
  return parts.join("+");
}

export function canStartChord(binding: string): boolean {
  return /^[a-z0-9,.;'[\]]$/.test(binding);
}

export function conflictsFor(
  id: string,
  binding: string,
  effective: Record<string, string[]>,
): string[] {
  const n = normalizeBinding(binding);
  const first = n.split(" ")[0];
  const out: string[] = [];
  for (const [other, keys] of Object.entries(effective)) {
    if (other === id) continue;
    for (const k of keys) {
      const m = normalizeBinding(k);
      if (m === n || m.split(" ")[0] === n || (n.includes(" ") && m === first)) {
        out.push(other);
        break;
      }
    }
  }
  return out.sort();
}
