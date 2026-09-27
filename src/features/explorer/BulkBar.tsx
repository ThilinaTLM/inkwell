// Floating bulk-action bar (screen 05). Visible while more than one item
// of `scope` is selected; every button is a registry command so labels,
// guards and shortcuts stay in sync with menus and the palette.
// Place inside a `relative` container (the page's main column).

import { Cancel01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { KeyCombo } from "@/components/shell/Kbd";
import { Button } from "@/components/ui/button";
import {
  commandLabel,
  getCommand,
  getEffectiveKeys,
  isCommandAvailable,
  runCommand,
  useCommandContext,
  useRegistryVersion,
} from "@/lib/commands/registry";
import { clearSelection, useSelection } from "@/lib/selection";
import { cn } from "@/lib/utils";

export const DEFAULT_BULK_IDS = [
  "item.openNewTab",
  "item.move",
  "item.tags",
  "item.share",
  "item.download",
  "item.duplicate",
  "item.restore",
  "item.purge",
  "item.trash",
] as const;

const SHORT_LABELS: Record<string, string> = {
  "item.openNewTab": "Open",
  "item.move": "Move",
  "item.tags": "Tags",
  "item.share": "Share",
  "item.download": "Download .zip",
  "item.duplicate": "Duplicate",
  "item.trash": "Trash",
  "item.restore": "Restore",
  "item.purge": "Delete forever",
};

const SHOW_KEYS = new Set(["item.move", "item.tags"]);

export function BulkBar({
  scope,
  ids = DEFAULT_BULK_IDS,
  min = 2,
  className,
}: {
  scope: string;
  ids?: readonly string[];
  /** Minimum selection size to show the bar (default 2). */
  min?: number;
  className?: string;
}) {
  useRegistryVersion();
  const sel = useSelection();
  const ctx = useCommandContext();
  if (sel.scope !== scope || sel.items.length < min) return null;
  return (
    <div
      role="toolbar"
      aria-label="Selection actions"
      data-no-marquee=""
      className={cn(
        "absolute bottom-11 left-1/2 z-20 flex max-w-[calc(100%-24px)] -translate-x-1/2 items-center gap-1 overflow-x-auto rounded-xl border border-border bg-popover p-1.5 shadow-2xl",
        className,
      )}
    >
      <span className="px-2.5 text-[13px] font-bold whitespace-nowrap text-accent-foreground">
        {sel.items.length} selected
      </span>
      {ids.map((id) => {
        const cmd = getCommand(id);
        if (!cmd || !isCommandAvailable(cmd, ctx)) return null;
        const reason = cmd.disabledReason?.(ctx) ?? null;
        const keys = getEffectiveKeys(id)[0];
        return (
          <Button
            key={id}
            size="sm"
            variant="ghost"
            disabled={!!reason}
            title={reason ?? commandLabel(cmd, ctx)}
            onClick={() => runCommand(id)}
            className={cn(
              "h-7 gap-1.5 px-2 text-xs",
              cmd.destructive && "text-destructive hover:text-destructive",
            )}
          >
            {cmd.icon ? (
              <HugeiconsIcon icon={cmd.icon} strokeWidth={2} className="size-3.5" />
            ) : null}
            {SHORT_LABELS[id] ?? commandLabel(cmd, ctx)}
            {keys && SHOW_KEYS.has(id) ? <KeyCombo binding={keys} /> : null}
          </Button>
        );
      })}
      <Button
        size="icon-sm"
        variant="ghost"
        aria-label="Clear selection"
        onClick={() => clearSelection(scope)}
      >
        <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} />
      </Button>
    </div>
  );
}
