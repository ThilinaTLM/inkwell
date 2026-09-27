// Command registry — one source for keyboard shortcuts, context menus,
// the bulk bar, the command palette and the shortcut sheet.
//
// PUBLIC CONTRACT
//
//   type CommandGroup = "navigate" | "select" | "file" | "view" | "organise" | "app"
//
//   interface CommandContext {
//     selection: ItemRef[];            // from the global selection store (or a menu override)
//     focused: ItemRef | null;
//     currentFolderId: string | null | undefined;  // undefined = not on an explorer route; null = Home
//     route: string;                   // location.pathname
//   }
//
//   interface Command {
//     id: string;                      // e.g. "item.move"
//     label: string | ((ctx) => string);
//     icon?: IconSvgElement;           // @hugeicons/core-free-icons icon
//     keys?: string[];                 // default bindings, see keymap.ts syntax
//     group: CommandGroup;
//     when?(ctx): boolean;             // hidden in menus/palette & keys ignored when false
//     disabledReason?(ctx): string | null;  // shown disabled + tooltip in menus when non-null
//     run(ctx): void | Promise<void>;
//     singleKey?: boolean;             // force (un)gating by the single-key pref; default derived from keys
//     palette?: boolean;               // false hides it from ⌘K (default true)
//     destructive?: boolean;           // red menu styling
//   }
//
//   registerCommands(cmds): () => void   – later registrations of the same id override
//                                          earlier ones until unregistered (stack).
//   useRegisterCommands(cmds, deps)      – hook form, unregisters on unmount
//   runCommand(id, ctxOverride?)         – runs if `when` passes; returns true when it ran
//   getCommand(id) / getCommands()
//   useCommandList(): Command[]          – reactive list (registry + key overrides)
//   useCommand(id): Command | undefined
//   getEffectiveKeys(id): string[]       – defaults merged with user overrides
//   formatKeys(keys)                     – re-exported from keymap
//   setCommandContext(partial) / getCommandContext(override?) / useCommandContext()
//   commandLabel(cmd, ctx)

import type { IconSvgElement } from "@hugeicons/react";
import { useEffect, useSyncExternalStore } from "react";
import type { ItemRef } from "@/lib/api/client";
import { getSelection, selectionStore } from "@/lib/selection";
import { createStore, useStore } from "@/lib/store";
import { getKeyOverrides, setBindingsProvider, subscribeKeyOverrides } from "./keymap";

export { formatKeys } from "./keymap";

export type CommandGroup = "navigate" | "select" | "file" | "view" | "organise" | "app";

export const COMMAND_GROUP_LABELS: Record<CommandGroup, string> = {
  navigate: "Navigation",
  select: "Selection",
  file: "Files",
  view: "View",
  organise: "Organise",
  app: "App",
};

export interface CommandContext {
  selection: ItemRef[];
  focused: ItemRef | null;
  currentFolderId: string | null | undefined;
  route: string;
}

export interface Command {
  id: string;
  label: string | ((ctx: CommandContext) => string);
  icon?: IconSvgElement;
  keys?: string[];
  group: CommandGroup;
  when?(ctx: CommandContext): boolean;
  disabledReason?(ctx: CommandContext): string | null;
  run(ctx: CommandContext): void | Promise<void>;
  singleKey?: boolean;
  palette?: boolean;
  destructive?: boolean;
}

// ─── Registry store ────────────────────────────────────────────────────

const stacks = new Map<string, Command[]>();
const versionStore = createStore(0);
let cachedList: Command[] = [];

function bump() {
  cachedList = [...stacks.values()].map((s) => s[s.length - 1]).filter((c): c is Command => !!c);
  versionStore.set((v) => v + 1);
}

export function registerCommands(cmds: Command[]): () => void {
  for (const c of cmds) {
    const stack = stacks.get(c.id) ?? [];
    stack.push(c);
    stacks.set(c.id, stack);
  }
  bump();
  return () => {
    for (const c of cmds) {
      const stack = stacks.get(c.id);
      if (!stack) continue;
      const i = stack.lastIndexOf(c);
      if (i >= 0) stack.splice(i, 1);
      if (stack.length === 0) stacks.delete(c.id);
    }
    bump();
  };
}

export function useRegisterCommands(cmds: Command[], deps: unknown[]): void {
  // biome-ignore lint/correctness/useExhaustiveDependencies: caller-controlled deps
  useEffect(() => registerCommands(cmds), deps);
}

export function getCommand(id: string): Command | undefined {
  const s = stacks.get(id);
  return s ? s[s.length - 1] : undefined;
}

export function getCommands(): Command[] {
  return cachedList;
}

export function getEffectiveKeys(id: string): string[] {
  const o = getKeyOverrides()[id];
  if (o) return o;
  return getCommand(id)?.keys ?? [];
}

setBindingsProvider(() => {
  const out: Record<string, string[]> = {};
  for (const c of cachedList) out[c.id] = getEffectiveKeys(c.id);
  return out;
});

// Combined version: registry changes + key overrides.
const combined = createStore(0);
versionStore.subscribe(() => combined.set((v) => v + 1));
subscribeKeyOverrides(() => combined.set((v) => v + 1));

export function useCommandList(): Command[] {
  useStore(combined);
  return cachedList;
}

export function useCommand(id: string): Command | undefined {
  useStore(combined);
  return getCommand(id);
}

/** Re-render on registry or key-override changes; returns a version. */
export function useRegistryVersion(): number {
  return useStore(combined);
}

// ─── Context ───────────────────────────────────────────────────────────

const contextStore = createStore<{ currentFolderId: string | null | undefined; route: string }>({
  currentFolderId: undefined,
  route: typeof location !== "undefined" ? location.pathname : "/",
});

export function setCommandContext(partial: Partial<CommandContext>): void {
  const { selection, focused, ...rest } = partial;
  if (Object.keys(rest).length > 0) {
    contextStore.set((prev) => {
      const next = { ...prev, ...rest };
      return next.currentFolderId === prev.currentFolderId && next.route === prev.route
        ? prev
        : next;
    });
  }
  if (selection !== undefined || focused !== undefined) {
    selectionStore.set((prev) => ({
      ...prev,
      ...(selection !== undefined ? { items: selection } : {}),
      ...(focused !== undefined ? { focused } : {}),
    }));
  }
}

export function getCommandContext(override?: Partial<CommandContext>): CommandContext {
  const sel = getSelection();
  const base = contextStore.get();
  return {
    selection: sel.items,
    focused: sel.focused,
    currentFolderId: base.currentFolderId,
    route: base.route,
    ...override,
  };
}

export function useCommandContext(override?: Partial<CommandContext>): CommandContext {
  const sel = useStore(selectionStore);
  const base = useSyncExternalStore(contextStore.subscribe, contextStore.get, contextStore.get);
  return {
    selection: sel.items,
    focused: sel.focused,
    currentFolderId: base.currentFolderId,
    route: base.route,
    ...override,
  };
}

export function commandLabel(cmd: Command, ctx: CommandContext): string {
  return typeof cmd.label === "function" ? cmd.label(ctx) : cmd.label;
}

export function isCommandAvailable(cmd: Command, ctx: CommandContext): boolean {
  try {
    return cmd.when ? cmd.when(ctx) : true;
  } catch {
    return false;
  }
}

/** Runs a command if available in the (optionally overridden) context.
 *  Returns true when the command ran. Errors are logged, not thrown. */
export function runCommand(id: string, override?: Partial<CommandContext>): boolean {
  const cmd = getCommand(id);
  if (!cmd) return false;
  const ctx = getCommandContext(override);
  if (!isCommandAvailable(cmd, ctx)) return false;
  if (cmd.disabledReason?.(ctx)) return false;
  try {
    const r = cmd.run(ctx);
    if (r && typeof (r as Promise<void>).catch === "function") {
      (r as Promise<void>).catch((e) => console.error(`command ${id} failed`, e));
    }
  } catch (e) {
    console.error(`command ${id} failed`, e);
  }
  return true;
}
