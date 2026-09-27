// Floating bulk-action bar (screen 05). Visible while more than one item
// of `scope` is selected; every button is a registry command so labels,
// guards and shortcuts stay in sync with menus and the palette.
// Place inside a `relative` container (the page's main column).
// Below 768px it docks full-width at the bottom of the screen and shows
// from a single selected item (touch selection mode, screen 23).

import { Cancel01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { KeyCombo } from "@/components/shell/Kbd";
import { useShellState } from "@/components/shell/shellStore";
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
  const docked = useShellState((s) => s.isMobile);
  if (sel.scope !== scope || sel.items.length < (docked ? 1 : min)) return null;
  return (
    <div
      role="toolbar"
      aria-label="Selection actions"
      data-no-marquee=""
      data-docked={docked || undefined}
      className={cn(
        docked
          ? "fixed inset-x-0 bottom-0 z-30 flex items-center gap-1 overflow-x-auto border-t border-border bg-popover px-1.5 pt-1.5 pb-[calc(0.375rem+env(safe-area-inset-bottom))] shadow-[0_-12px_30px_-18px_rgba(28,24,20,0.45)]"
          : "absolute bottom-11 left-1/2 z-20 flex max-w-[calc(100%-24px)] -translate-x-1/2 items-center gap-1 overflow-x-auto rounded-xl border border-border bg-popover p-1.5 shadow-2xl",
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
            {keys && SHOW_KEYS.has(id) && !docked ? <KeyCombo binding={keys} /> : null}
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
