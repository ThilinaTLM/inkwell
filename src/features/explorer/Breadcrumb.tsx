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
//
// Variants:
//   - "default": standalone strip with its own `px-6 py-2` and `text-sm`.
//   - "compact": flush + `text-xs`. For embedding inside another header.
//   - "heading": page-title sized (`font-heading text-2xl`). Used as the
//     page heading itself, replacing a separate `<h1>`. The current
//     segment reads as the page title; ancestors are clickable links.

import { Fragment } from "react";
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

export type BreadcrumbVariant = "default" | "compact" | "heading";

interface BreadcrumbProps {
  /** Folder path from the root-most ancestor down to the current folder. */
  path: FolderMeta[];
  /** Called with the target folder id, or `null` to jump back to the root. */
  onJump: (id: string | null) => void;
  /** Visual variant. See file-level docs. Default `"default"`. */
  variant?: BreadcrumbVariant;
}

/** Maximum number of named segments shown after "Home" before the
 *  middle of the path is collapsed into a "…" dropdown. */
const MAX_VISIBLE = 2;

export function Breadcrumb({
  path,
  onJump,
  variant = "default",
}: BreadcrumbProps) {
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

  const isHeading = variant === "heading";
  const isCompact = variant === "compact";

  return (
    <nav
      aria-label="Folder path"
      className={cn(
        "flex items-center text-ink-soft",
        isHeading && "min-w-0 gap-1.5 font-heading text-2xl",
        isCompact && "gap-1 text-xs",
        !isHeading && !isCompact && "gap-1 px-6 py-2 text-sm"
      )}
    >
      <button
        type="button"
        onClick={() => onJump(null)}
        aria-current={atRoot ? "page" : undefined}
        className={cn(
          "inline-flex items-center rounded transition-colors hover:text-ink",
          isHeading ? "gap-2 px-0.5" : "gap-1.5 px-1 py-0.5",
          atRoot && "text-ink"
        )}
      >
        <HugeiconsIcon
          icon={Home01Icon}
          strokeWidth={1.6}
          className={cn(
            "opacity-80",
            isHeading ? "size-5" : "size-3.5"
          )}
        />
        Home
      </button>

      {collapsed.length > 0 && (
        <Fragment>
          <Separator heading={isHeading} />
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <button
                  type="button"
                  aria-label={`Show ${collapsed.length} collapsed folder${
                    collapsed.length === 1 ? "" : "s"
                  }`}
                  className={cn(
                    "inline-flex items-center justify-center rounded text-ink-muted hover:bg-manila-soft/50 hover:text-ink",
                    isHeading ? "size-8" : "size-6"
                  )}
                />
              }
            >
              <HugeiconsIcon
                icon={MoreHorizontalIcon}
                strokeWidth={2}
                className={isHeading ? "size-5" : "size-3.5"}
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
            <Separator heading={isHeading} />
            {isLast ? (
              <span
                aria-current="page"
                className={cn(
                  "min-w-0 truncate rounded text-ink",
                  isHeading ? "px-0.5" : "px-1 py-0.5"
                )}
                title={f.name}
              >
                {f.name}
              </span>
            ) : (
              <button
                type="button"
                onClick={() => onJump(f.id)}
                className={cn(
                  "min-w-0 truncate rounded transition-colors hover:text-ink",
                  isHeading ? "px-0.5" : "px-1 py-0.5"
                )}
                title={f.name}
              >
                {f.name}
              </button>
            )}
          </Fragment>
        );
      })}
    </nav>
  );
}

function Separator({ heading }: { heading?: boolean }) {
  return (
    <HugeiconsIcon
      icon={ArrowRight01Icon}
      strokeWidth={1.5}
      className={cn("opacity-50", heading ? "size-5" : "size-3")}
      aria-hidden
    />
  );
}
