// ViewSwitcher — three-button segmented control for the explorer header.
//
// Switches between Browse (folder navigation), Recent (recently-updated
// scenes), and Search (global query + tag filter). The current button
// gets a paper-elev background and ink text; the others sit on the
// header's transparent surface.
//
// Visual character is sketched to match the rest of the dashboard: a
// `RoughBox` pill is drawn behind whichever button is active, so the
// "selected" affordance reads like a hand-shaded marker rather than a
// crisp filled rectangle.

import { HugeiconsIcon } from "@hugeicons/react";
import {
  Clock01Icon,
  Folder01Icon,
  Search01Icon,
} from "@hugeicons/core-free-icons";

import { RoughBox } from "@/components/rough";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export type ExplorerView = "browse" | "recent" | "search";

interface ViewSwitcherProps {
  active: ExplorerView;
  onChange: (next: ExplorerView) => void;
}

interface Button {
  view: ExplorerView;
  label: string;
  icon: typeof Folder01Icon;
}

const BUTTONS: readonly Button[] = [
  { view: "browse", label: "Browse", icon: Folder01Icon },
  { view: "recent", label: "Recent", icon: Clock01Icon },
  { view: "search", label: "Search", icon: Search01Icon },
];

export function ViewSwitcher({ active, onChange }: ViewSwitcherProps) {
  return (
    <div
      role="tablist"
      aria-label="Dashboard view"
      className="relative inline-flex items-center gap-0.5 rounded-md bg-paper-elev/40 p-1"
    >
      {BUTTONS.map((b) => {
        const isActive = b.view === active;
        return (
          <Tooltip key={b.view}>
            <TooltipTrigger
              render={
                <button
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => onChange(b.view)}
                  className={cn(
                    "relative grid size-8 place-items-center rounded text-ink-soft transition-colors hover:text-ink",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
                    isActive && "text-ink"
                  )}
                />
              }
            >
              {isActive && (
                <span aria-hidden className="pointer-events-none absolute inset-0">
                  <RoughBox
                    shape="rect"
                    seed={`view-${b.view}-active`}
                    stroke="var(--color-ink-soft)"
                    strokeWidth={1.2}
                    fill="var(--color-paper-elev)"
                    fillStyle="solid"
                    roughness={1.1}
                    bowing={2}
                    radius={6}
                  />
                </span>
              )}
              <HugeiconsIcon
                icon={b.icon}
                strokeWidth={1.7}
                className="relative size-4"
              />
              <span className="sr-only">{b.label}</span>
            </TooltipTrigger>
            <TooltipContent>{b.label}</TooltipContent>
          </Tooltip>
        );
      })}
    </div>
  );
}
