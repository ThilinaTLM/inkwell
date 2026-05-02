// View + layout segmented controls for the explorer.
//
// `<ViewSwitcher>` (Browse / Recent / Search) is the primary view
// selector and lives in the header next to the wordmark.
//
// `<LayoutToggle>` (Grid / List) is the orthogonal display selector and
// lives in each view's toolbar row (e.g. the breadcrumb row in Browse)
// rather than the header — it's a per-view content control, not a
// global navigation control.
//
// The "selected" affordance is a clean paper-elev pill — RoughBox is
// reserved for content artifacts (cards, tape chips, empty-state notes).

import { HugeiconsIcon } from "@hugeicons/react";
import {
  Clock01Icon,
  Folder01Icon,
  Search01Icon,
  GridViewIcon,
  LeftToRightListBulletIcon,
} from "@hugeicons/core-free-icons";

import { cn } from "@/lib/utils";

export type ExplorerView = "browse" | "recent" | "search";
export type ExplorerLayout = "grid" | "list";

interface ViewSwitcherProps {
  active: ExplorerView;
  onChange: (next: ExplorerView) => void;
}

interface LayoutToggleProps {
  layout: ExplorerLayout;
  onChange: (next: ExplorerLayout) => void;
}

interface ViewButton {
  view: ExplorerView;
  label: string;
  icon: typeof Folder01Icon;
}

interface LayoutButton {
  layout: ExplorerLayout;
  label: string;
  icon: typeof Folder01Icon;
}

const VIEW_BUTTONS: readonly ViewButton[] = [
  { view: "browse", label: "Browse", icon: Folder01Icon },
  { view: "recent", label: "Recent", icon: Clock01Icon },
  { view: "search", label: "Search", icon: Search01Icon },
];

const LAYOUT_BUTTONS: readonly LayoutButton[] = [
  { layout: "grid", label: "Grid", icon: GridViewIcon },
  { layout: "list", label: "List", icon: LeftToRightListBulletIcon },
];

const PILL_ACTIVE =
  "bg-paper-elev text-ink ring-1 ring-ink-soft/30 shadow-[0_1px_0_rgba(0,0,0,0.04)] dark:shadow-[0_1px_0_rgba(0,0,0,0.4)]";

export function ViewSwitcher({ active, onChange }: ViewSwitcherProps) {
  return (
    <div
      role="tablist"
      aria-label="Dashboard view"
      className="inline-flex items-center gap-0.5 rounded-md bg-paper-elev/40 p-1"
    >
      {VIEW_BUTTONS.map((b) => {
        const isActive = b.view === active;
        return (
          <button
            key={b.view}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(b.view)}
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded px-2.5 font-sans text-xs text-ink-soft transition-colors hover:text-ink",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
              isActive && PILL_ACTIVE,
            )}
          >
            <HugeiconsIcon icon={b.icon} strokeWidth={1.7} className="size-4" />
            <span>{b.label}</span>
          </button>
        );
      })}
    </div>
  );
}

export function LayoutToggle({ layout, onChange }: LayoutToggleProps) {
  return (
    <div
      role="group"
      aria-label="Layout"
      className="inline-flex items-center gap-0.5 rounded-md bg-paper-elev/40 p-1"
    >
      {LAYOUT_BUTTONS.map((b) => {
        const isActive = b.layout === layout;
        return (
          <button
            key={b.layout}
            type="button"
            aria-pressed={isActive}
            aria-label={b.label}
            title={b.label}
            onClick={() => onChange(b.layout)}
            className={cn(
              "inline-flex h-7 items-center justify-center rounded px-1.5 font-sans text-xs text-ink-soft transition-colors hover:text-ink",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
              isActive && PILL_ACTIVE,
            )}
          >
            <HugeiconsIcon icon={b.icon} strokeWidth={1.7} className="size-4" />
          </button>
        );
      })}
    </div>
  );
}

