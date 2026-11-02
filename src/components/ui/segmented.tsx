// Single-select segmented control (`aria-pressed` buttons in a fieldset).

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface SegOption<T extends string> {
  value: T;
  label: ReactNode;
  disabled?: boolean;
  title?: string;
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  ariaLabel,
  className,
}: {
  value: T;
  onChange: (next: T) => void;
  options: ReadonlyArray<SegOption<T>>;
  ariaLabel: string;
  className?: string;
}) {
  return (
    <fieldset
      className={cn(
        "inline-flex h-8 shrink-0 overflow-hidden rounded-[10px] border border-input bg-card p-0",
        className,
      )}
    >
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
              "border-r border-input px-3 text-xs whitespace-nowrap text-muted-foreground outline-none last:border-r-0 hover:bg-muted hover:text-foreground focus-visible:relative focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/60 disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:bg-transparent",
              on && "bg-accent-soft font-medium text-accent-text hover:bg-accent-soft hover:text-accent-text",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </fieldset>
  );
}
