// Kbd — a keyboard-shortcut chip.
//
// Used by the command palette, tooltips, and the Settings → Shortcuts
// list. `keys` is rendered as separate chips joined by a thin "+"; a
// leading "mod" key is resolved to ⌘ on Apple platforms and Ctrl
// everywhere else, so one declaration serves both.

import { cn } from "@/lib/utils";

const IS_APPLE =
  typeof navigator !== "undefined" && /mac|iphone|ipad|ipod/i.test(navigator.platform || "");

export function modKeyLabel(): string {
  return IS_APPLE ? "⌘" : "Ctrl";
}

export function Kbd({ keys, className }: { keys: string | string[]; className?: string }) {
  const list = (Array.isArray(keys) ? keys : [keys]).map((k) =>
    k.toLowerCase() === "mod" ? modKeyLabel() : k,
  );
  return (
    <span className={cn("inline-flex items-center gap-0.5", className)}>
      {list.map((k, i) => (
        <span key={`${k}-${i}`} className="inline-flex items-center gap-0.5">
          {i > 0 ? <span className="text-[0.625rem] text-muted-foreground/60">+</span> : null}
          <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded border border-border bg-muted px-1 font-sans text-[0.6875rem] font-medium leading-none text-muted-foreground">
            {k}
          </kbd>
        </span>
      ))}
    </span>
  );
}
