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
//   - "heading": page-title sized (`font-heading text-xl`). Used as the
//     page heading itself, replacing a separate `<h1>`. The current
//     segment reads as the page title; ancestors are clickable links.

import { ArrowRight01Icon, Home01Icon, MoreHorizontalIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Fragment } from "react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { FolderMeta } from "@/lib/api/client";
import { useMediaQuery } from "@/lib/useMediaQuery";
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
 *  middle of the path is collapsed into a "…" dropdown.
 *
 *  We use **two values**: a roomy `MAX_VISIBLE_DEFAULT` for tablet /
 *  desktop where there's space for `parent › current`, and a tighter
 *  `MAX_VISIBLE_MOBILE` for narrow phones where the current folder
 *  name needs the full row to stay readable. The crossover matches
 *  Tailwind's `sm` breakpoint (640 px) so the heading-variant font
 *  size and the segment count flip together. */
const MAX_VISIBLE_DEFAULT = 2;
const MAX_VISIBLE_MOBILE = 1;
/** Matches Tailwind v4's default `sm` breakpoint. Keep in sync if the
 *  theme overrides it. */
const SM_QUERY = "(min-width: 640px)";

export function Breadcrumb({ path, onJump, variant = "default" }: BreadcrumbProps) {
  // Heading-variant breadcrumb is the explorer page title and lives in
  // a tight header row alongside action buttons — so on `<sm` we drop
  // to a single visible segment (the current folder) and push every
  // ancestor into the "…" dropdown. Other variants always use the
  // default budget; their layouts have plenty of room.
  const isWide = useMediaQuery(SM_QUERY);
  const maxVisible = variant === "heading" && !isWide ? MAX_VISIBLE_MOBILE : MAX_VISIBLE_DEFAULT;

  // Always-visible: Home + last segment + (optionally) the parent of the
  // last segment. Anything between Home and that suffix collapses into "…".
  const atRoot = path.length === 0;

  let visible: FolderMeta[];
  let collapsed: FolderMeta[];
  if (path.length <= maxVisible) {
    visible = path;
    collapsed = [];
  } else {
    // Keep the last `maxVisible` segments visible; collapse the rest.
    const head = path.slice(0, path.length - maxVisible);
    visible = path.slice(path.length - maxVisible);
    collapsed = head;
  }

  const isHeading = variant === "heading";
  const isCompact = variant === "compact";

  return (
    <nav
      aria-label="Folder path"
      className={cn(
        "flex items-center text-muted-foreground",
        isHeading && "min-w-0 gap-1 font-heading text-sm sm:gap-1.5 sm:text-base",
        isCompact && "gap-1 text-xs",
        !isHeading && !isCompact && "gap-1 px-6 py-2 text-sm",
      )}
    >
      <button
        type="button"
        onClick={() => onJump(null)}
        aria-current={atRoot ? "page" : undefined}
        aria-label="Home"
        className={cn(
          "inline-flex shrink-0 items-center rounded transition-colors hover:text-foreground",
          isHeading ? "gap-1.5 px-0.5 sm:gap-2" : "gap-1.5 px-1 py-0.5",
          atRoot && "text-foreground",
        )}
      >
        <HugeiconsIcon
          icon={Home01Icon}
          strokeWidth={1.6}
          className={cn("opacity-80", isHeading ? "size-4 sm:size-4.5" : "size-3.5")}
        />
        <span className={cn(isHeading && "hidden sm:inline")}>Home</span>
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
                    "inline-flex shrink-0 items-center justify-center rounded text-muted-foreground/70 hover:bg-accent hover:text-accent-foreground",
                    isHeading ? "size-7" : "size-6",
                  )}
                />
              }
            >
              <HugeiconsIcon
                icon={MoreHorizontalIcon}
                strokeWidth={2}
                className={isHeading ? "size-4" : "size-3.5"}
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
              // Current folder — the page the user is on. Keep it
              // readable: default `shrink` (1) so it only starts
              // truncating after ancestors have collapsed first.
              <span
                aria-current="page"
                className={cn(
                  "min-w-0 truncate rounded text-foreground",
                  isHeading ? "px-0.5" : "px-1 py-0.5",
                )}
                title={f.name}
              >
                {f.name}
              </span>
            ) : (
              // Ancestor segment — collapses first when space is
              // tight. `shrink-[8]` makes it shrink ~8× faster than
              // the current segment, so a deep path like
              // "Home › Sub T… › SubSubTest" keeps the current name
              // fully visible while the ancestor truncates.
              <button
                type="button"
                onClick={() => onJump(f.id)}
                className={cn(
                  "min-w-0 shrink-[8] truncate rounded transition-colors hover:text-foreground",
                  isHeading ? "px-0.5" : "px-1 py-0.5",
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
      // `shrink-0` so the chevrons never compete for flex room with
      // the segments themselves — their width is fixed.
      className={cn("shrink-0 opacity-50", heading ? "size-4" : "size-3")}
      aria-hidden
    />
  );
}
