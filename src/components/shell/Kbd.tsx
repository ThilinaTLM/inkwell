// Keyboard-key chips.
//
// PUBLIC CONTRACT
//   <Kbd>⌘</Kbd>                         – a single key cap
//   <KeyCombo binding="mod+shift+c" />   – renders a binding as key caps (platform aware)
//   <CommandKeys id="item.move" />       – the effective (user-overridable) first binding
//                                          of a registry command; renders nothing if unbound

import type { ReactNode } from "react";
import { formatBindingParts } from "@/lib/commands/keymap";
import { getEffectiveKeys, useRegistryVersion } from "@/lib/commands/registry";
import { cn } from "@/lib/utils";

// Quiet, theme-matched cap: Inter (not mono), hairline border, a whisper of
// surface tint and a 1px inset underline for depth instead of a chunky
// bottom border. Reads as part of the warm UI rather than a terminal glyph.
const KBD_CAP =
  "inline-flex h-5 min-w-5 items-center justify-center gap-[3px] rounded-[6px] border border-border bg-foreground/[0.035] px-1.5 font-sans text-[11px] font-medium leading-none tracking-wide text-faint shadow-[inset_0_-1px_0_var(--border)] select-none";

export function Kbd({ children, className }: { children: ReactNode; className?: string }) {
  return <kbd className={cn(KBD_CAP, className)}>{children}</kbd>;
}

export function KeyCombo({ binding, className }: { binding: string; className?: string }) {
  // A combo ("Ctrl K", "⌘⇧C") renders as ONE cap; chord steps (" " entries)
  // split into separate caps, e.g. "g h" → [G] [H].
  const steps: string[][] = [[]];
  for (const p of formatBindingParts(binding)) {
    if (p === " ") steps.push([]);
    else steps[steps.length - 1].push(p);
  }
  return (
    <span className={cn("inline-flex items-center gap-1", className)}>
      {steps
        .filter((s) => s.length > 0)
        .map((s, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: static list
          <Kbd key={i}>
            {s.map((p, j) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: static list
              <span key={j}>{p}</span>
            ))}
          </Kbd>
        ))}
    </span>
  );
}

export function CommandKeys({ id, className }: { id: string; className?: string }) {
  useRegistryVersion();
  const first = getEffectiveKeys(id)[0];
  return first ? <KeyCombo binding={first} className={className} /> : null;
}
