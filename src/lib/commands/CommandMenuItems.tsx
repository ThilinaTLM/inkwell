// Renders registry commands as menu items with right-aligned shortcuts.
//
// PUBLIC CONTRACT
//   <CommandMenuItems
//      ids={["item.open", "-", "item.share", ...]}   // "-" = separator (collapsed when adjacent/edge)
//      as="context" | "dropdown"                      // which shadcn menu primitive to render
//      ctx?={Partial<CommandContext>}                 // override (e.g. a tree node's folder as selection)
//      onRun?={(id) => void}                          // called after a command runs
//   />
//
// - Items whose `when(ctx)` is false are hidden.
// - Items whose `disabledReason(ctx)` returns a string are shown disabled
//   with that string as a tooltip (title attribute).
// - The shortcut label is the user's effective first binding.
// - Commands with `destructive: true` get the destructive variant.

import { HugeiconsIcon } from "@hugeicons/react";
import { Fragment } from "react";
import {
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
} from "@/components/ui/context-menu";
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
} from "@/components/ui/dropdown-menu";
import { formatKeys } from "./keymap";
import {
  type CommandContext,
  commandLabel,
  getCommand,
  getEffectiveKeys,
  isCommandAvailable,
  runCommand,
  useCommandContext,
  useRegistryVersion,
} from "./registry";

export interface CommandMenuItemsProps {
  ids: readonly string[];
  as: "context" | "dropdown";
  ctx?: Partial<CommandContext>;
  onRun?: (id: string) => void;
}

export function CommandMenuItems({ ids, as, ctx: override, onRun }: CommandMenuItemsProps) {
  useRegistryVersion();
  const ctx = useCommandContext(override);

  // Resolve visible rows first so separators can be collapsed.
  const rows: Array<"-" | { id: string }> = [];
  for (const id of ids) {
    if (id === "-") {
      if (rows.length && rows[rows.length - 1] !== "-") rows.push("-");
      continue;
    }
    const cmd = getCommand(id);
    if (!cmd || !isCommandAvailable(cmd, ctx)) continue;
    rows.push({ id });
  }
  while (rows[rows.length - 1] === "-") rows.pop();

  const Item = as === "context" ? ContextMenuItem : DropdownMenuItem;
  const Sep = as === "context" ? ContextMenuSeparator : DropdownMenuSeparator;
  const Shortcut = as === "context" ? ContextMenuShortcut : DropdownMenuShortcut;

  return (
    <>
      {rows.map((row, i) => {
        if (row === "-") {
          // biome-ignore lint/suspicious/noArrayIndexKey: separators have no identity
          return <Sep key={`sep-${i}`} />;
        }
        const cmd = getCommand(row.id);
        if (!cmd) return null;
        const reason = cmd.disabledReason?.(ctx) ?? null;
        const keys = formatKeys(getEffectiveKeys(cmd.id));
        return (
          <Fragment key={cmd.id}>
            <Item
              variant={cmd.destructive ? "destructive" : "default"}
              disabled={!!reason}
              title={reason ?? undefined}
              data-command={cmd.id}
              onClick={() => {
                if (runCommand(cmd.id, override)) onRun?.(cmd.id);
              }}
            >
              {cmd.icon ? (
                <HugeiconsIcon icon={cmd.icon} strokeWidth={2} />
              ) : (
                <span className="size-4" aria-hidden />
              )}
              <span className="truncate">{commandLabel(cmd, ctx)}</span>
              {keys ? <Shortcut className="pl-4">{keys}</Shortcut> : null}
            </Item>
          </Fragment>
        );
      })}
    </>
  );
}
