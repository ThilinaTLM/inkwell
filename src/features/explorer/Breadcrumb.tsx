// Breadcrumb — folder path navigator for the Browse view.
//
// Renders: Home › segment › segment › … › current
// where:
//   - "Home" jumps back to the literal root (`onJump(null)`).
//   - Each middle segment is a button (`onJump(folder.id)`).
//   - The last segment is the current folder name and is non-interactive
//     (rendered with `aria-current="page"`).
//
// Overflow rule: if the path has more than `MAX_VISIBLE` segments after
// Home, we show `Home › … › parent › current` and stash every collapsed
// segment in a `…` dropdown.

import { Fragment, type ReactNode } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  ArrowRight01Icon,
  Home01Icon,
  MoreHorizontalIcon,
} from "@hugeicons/core-free-icons";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { FolderMeta } from "@/lib/api/client";
import { cn } from "@/lib/utils";

interface BreadcrumbProps {
  /** Folder path from the root-most ancestor down to the current folder. */
  path: FolderMeta[];
  /** Called with the target folder id, or `null` to jump back to the root. */
  onJump: (id: string | null) => void;
  /** Optional content rendered flush-right on the breadcrumb row
   *  (e.g. a layout toggle). Pushed to the far edge with `ml-auto`. */
  trailing?: ReactNode;
}

/** Maximum number of named segments shown after "Home" before the
 *  middle of the path is collapsed into a "…" dropdown. */
const MAX_VISIBLE = 2;

export function Breadcrumb({ path, onJump, trailing }: BreadcrumbProps) {
  // Always-visible: Home + last segment + (optionally) the parent of the
  // last segment. Anything between Home and that suffix collapses into "…".
  const atRoot = path.length === 0;

  let visible: FolderMeta[];
  let collapsed: FolderMeta[];
  if (path.length <= MAX_VISIBLE) {
    visible = path;
    collapsed = [];
  } else {
    // Keep the last MAX_VISIBLE segments visible; collapse the rest.
    const head = path.slice(0, path.length - MAX_VISIBLE);
    visible = path.slice(path.length - MAX_VISIBLE);
    collapsed = head;
  }

  return (
    <nav
      aria-label="Folder path"
      className="flex items-center gap-1 px-6 py-2 text-sm text-ink-soft"
    >
      <button
        type="button"
        onClick={() => onJump(null)}
        aria-current={atRoot ? "page" : undefined}
        className={cn(
          "inline-flex items-center gap-1.5 rounded px-1 py-0.5 transition-colors hover:text-ink",
          atRoot && "text-ink"
        )}
      >
        <HugeiconsIcon
          icon={Home01Icon}
          strokeWidth={1.6}
          className="size-3.5 opacity-80"
        />
        Home
      </button>

      {collapsed.length > 0 && (
        <Fragment>
          <Separator />
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <button
                  type="button"
                  aria-label={`Show ${collapsed.length} collapsed folder${
                    collapsed.length === 1 ? "" : "s"
                  }`}
                  className="inline-flex size-6 items-center justify-center rounded text-ink-muted hover:bg-manila-soft/50 hover:text-ink"
                />
              }
            >
              <HugeiconsIcon
                icon={MoreHorizontalIcon}
                strokeWidth={2}
                className="size-3.5"
              />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" sideOffset={4}>
              {collapsed.map((f) => (
                <DropdownMenuItem key={f.id} onClick={() => onJump(f.id)}>
                  {f.name}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </Fragment>
      )}

      {visible.map((f, i) => {
        const isLast = i === visible.length - 1;
        return (
          <Fragment key={f.id}>
            <Separator />
            {isLast ? (
              <span
                aria-current="page"
                className="rounded px-1 py-0.5 text-ink"
              >
                {f.name}
              </span>
            ) : (
              <button
                type="button"
                onClick={() => onJump(f.id)}
                className="rounded px-1 py-0.5 transition-colors hover:text-ink"
              >
                {f.name}
              </button>
            )}
          </Fragment>
        );
      })}

      {trailing && <div className="ml-auto flex items-center">{trailing}</div>}
    </nav>
  );
}

function Separator() {
  return (
    <HugeiconsIcon
      icon={ArrowRight01Icon}
      strokeWidth={1.5}
      className="size-3 opacity-50"
      aria-hidden
    />
  );
}
