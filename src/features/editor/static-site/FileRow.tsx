// FileRow — one row of the bundle table. Mirrors the library list rows:
// kind tile · name (+ folder path) · kind · size · modified · actions.

import {
  Delete02Icon,
  Download01Icon,
  FileEditIcon,
  Home01Icon,
  MoreHorizontalIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { StaticSiteAsset } from "@/lib/api/client";
import { relTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { chipForPath } from "./fileKindChip";
import { baseName, formatBytes, isHtmlPath } from "./sitePaths";

export const FILE_GRID =
  "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 md:grid-cols-[minmax(0,1fr)_7rem_5.5rem_7rem_5.5rem]";

export interface FileRowProps {
  asset: StaticSiteAsset;
  isEntry: boolean;
  writable: boolean;
  busy: boolean;
  /** Absolute URL for download, when a render session exists. */
  href: string | null;
  onOpen: (path: string) => void;
  onSetEntry: (path: string) => void;
  onDelete: (path: string) => void;
}

export function KindTile({ path, className }: { path: string; className?: string }) {
  const chip = chipForPath(path);
  return (
    <span
      role="img"
      aria-label={chip.label}
      title={chip.label}
      className={cn(
        "inline-flex size-8 shrink-0 items-center justify-center rounded-[9px] border border-border/70 font-mono text-[10px] font-semibold tracking-tight text-foreground/80",
        className,
      )}
      style={{ background: `color-mix(in oklab, ${chip.color} 24%, transparent)` }}
    >
      {chip.abbr}
    </span>
  );
}

export function FileRow({
  asset,
  isEntry,
  writable,
  busy,
  href,
  onOpen,
  onSetEntry,
  onDelete,
}: FileRowProps) {
  const chip = chipForPath(asset.path);
  const dir = asset.path.includes("/") ? asset.path.slice(0, asset.path.lastIndexOf("/")) : "";
  const canBeEntry = !isEntry && isHtmlPath(asset.path);
  const canDelete = writable && !isEntry;

  return (
    <li
      data-testid="site-file-row"
      className={cn(
        FILE_GRID,
        "group/row min-h-12 border-b border-border/50 px-3 py-2 last:border-b-0 hover:bg-muted/50 sm:px-4",
      )}
    >
      <button
        type="button"
        onClick={() => onOpen(asset.path)}
        className="flex min-w-0 items-center gap-3 rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
      >
        <KindTile path={asset.path} />
        <span className="min-w-0">
          <span className="flex items-center gap-2">
            <span className="truncate text-sm font-medium text-foreground">
              {baseName(asset.path)}
            </span>
            {isEntry ? (
              <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-accent-soft px-1.5 py-px text-[10px] font-medium text-accent-text">
                <HugeiconsIcon icon={Home01Icon} strokeWidth={2} className="size-2.5" />
                Entry
              </span>
            ) : null}
          </span>
          <span className="block truncate text-xs text-muted-foreground">
            {dir ? `${dir}/` : null}
            <span className="md:hidden">
              {dir ? " · " : ""}
              {formatBytes(asset.size)}
            </span>
          </span>
        </span>
      </button>

      <span className="hidden text-xs text-muted-foreground md:block">{chip.label}</span>
      <span className="hidden text-xs text-muted-foreground tabular-nums md:block">
        {formatBytes(asset.size)}
      </span>
      <span className="hidden text-xs text-muted-foreground md:block">
        {relTime(asset.updatedAt)}
      </span>

      <div className="flex items-center justify-end gap-0.5">
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Actions for ${asset.path}`}
                className="text-muted-foreground"
              >
                <HugeiconsIcon icon={MoreHorizontalIcon} strokeWidth={1.8} />
              </Button>
            }
          />
          <DropdownMenuContent align="end" className="w-auto min-w-48">
            <DropdownMenuItem onClick={() => onOpen(asset.path)}>
              <HugeiconsIcon icon={FileEditIcon} strokeWidth={1.8} />
              {writable ? "Open in editor" : "View source"}
            </DropdownMenuItem>
            {writable && canBeEntry ? (
              <DropdownMenuItem disabled={busy} onClick={() => onSetEntry(asset.path)}>
                <HugeiconsIcon icon={Home01Icon} strokeWidth={1.8} />
                Set as entry page
              </DropdownMenuItem>
            ) : null}
            {href ? (
              <DropdownMenuItem
                onClick={() => {
                  const a = document.createElement("a");
                  a.href = href;
                  a.download = baseName(asset.path);
                  a.target = "_blank";
                  a.rel = "noopener";
                  document.body.appendChild(a);
                  a.click();
                  a.remove();
                }}
              >
                <HugeiconsIcon icon={Download01Icon} strokeWidth={1.8} />
                Download
              </DropdownMenuItem>
            ) : null}
            {canDelete ? (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  variant="destructive"
                  disabled={busy}
                  onClick={() => onDelete(asset.path)}
                >
                  <HugeiconsIcon icon={Delete02Icon} strokeWidth={1.8} />
                  Delete
                </DropdownMenuItem>
              </>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </li>
  );
}
