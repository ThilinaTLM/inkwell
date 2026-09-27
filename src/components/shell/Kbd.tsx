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

export function Kbd({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <kbd
      className={cn(
        "inline-flex h-[18px] min-w-[18px] items-center justify-center rounded border border-b-2 border-border bg-muted/60 px-1 font-mono text-[10.5px] leading-none text-muted-foreground",
        className,
      )}
    >
      {children}
    </kbd>
  );
}

export function KeyCombo({ binding, className }: { binding: string; className?: string }) {
  const parts = formatBindingParts(binding);
  return (
    <span className={cn("inline-flex items-center gap-0.5", className)}>
      {parts.map((p, i) =>
        p === " " ? (
          // biome-ignore lint/suspicious/noArrayIndexKey: static list
          <span key={i} className="w-0.5" />
        ) : (
          // biome-ignore lint/suspicious/noArrayIndexKey: static list
          <Kbd key={i}>{p}</Kbd>
        ),
      )}
    </span>
  );
}

export function CommandKeys({ id, className }: { id: string; className?: string }) {
  useRegistryVersion();
  const first = getEffectiveKeys(id)[0];
  return first ? <KeyCombo binding={first} className={className} /> : null;
}
