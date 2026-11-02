// Single-select pill chips.

import { cn } from "@/lib/utils";
import type { SegOption } from "./segmented";

export function ChipGroup<T extends string>({
  value,
  onChange,
  options,
  ariaLabel,
  className,
}: {
  value: T | null;
  onChange: (next: T) => void;
  options: ReadonlyArray<SegOption<T>>;
  ariaLabel: string;
  className?: string;
}) {
  return (
    <fieldset className={cn("flex flex-wrap gap-1 border-0 p-0", className)}>
      <legend className="sr-only">{ariaLabel}</legend>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={on}
            disabled={o.disabled}
            title={o.title}
            onClick={() => onChange(o.value)}
            className={cn(
              "inline-flex h-7 items-center rounded-full border border-border px-2.5 text-xs whitespace-nowrap text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60 disabled:opacity-45",
              on && "border-primary/50 bg-accent-soft font-medium text-accent-text hover:bg-accent-soft",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </fieldset>
  );
}
