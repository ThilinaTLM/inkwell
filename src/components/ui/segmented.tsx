// Segmented — a compact, single-choice control.
//
// Used for the grid/list view toggle and any other two-to-four option
// switch that is too small to justify a `<Select>`. Rendered as a
// radiogroup so arrow keys and screen readers behave; the active item
// gets the card surface so it reads as "raised" inside the muted track.

import type { ComponentType, ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface SegmentedItem<T extends string> {
  value: T;
  label: string;
  /** Optional Hugeicons icon component; when present the label becomes the a11y name only. */
  icon?: ComponentType<{ strokeWidth?: number; className?: string }> | unknown;
  render?: ReactNode;
}

interface SegmentedProps<T extends string> {
  value: T;
  onChange: (next: T) => void;
  items: ReadonlyArray<SegmentedItem<T>>;
  /** Accessible name for the group. */
  label: string;
  className?: string;
}

export function Segmented<T extends string>({
  value,
  onChange,
  items,
  label,
  className,
}: SegmentedProps<T>) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn(
        "inline-flex items-center gap-0.5 rounded-md border border-border bg-muted p-0.5",
        className,
      )}
    >
      {items.map((item) => {
        const active = item.value === value;
        return (
          <button
            key={item.value}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={item.label}
            title={item.label}
            onClick={() => onChange(item.value)}
            className={cn(
              "inline-flex h-7 items-center justify-center gap-1.5 rounded-sm px-2 text-xs font-medium transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              active
                ? "bg-card text-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {item.render}
          </button>
        );
      })}
    </div>
  );
}
