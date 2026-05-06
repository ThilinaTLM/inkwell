// SegmentedOptions — radio-style button group used across the
// Preferences tab. Lifted from the inline implementation that the
// pre-rebrand Account page used for the editor-style picker, so the
// three preference groups (theme / editor style / default file kind)
// share one visual treatment.

import { cn } from "@/lib/utils";

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  description?: string;
}

interface SegmentedOptionsProps<T extends string> {
  value: T;
  onChange: (next: T) => void;
  options: ReadonlyArray<SegmentedOption<T>>;
  /** Accessible label for the group (e.g. "Theme"). */
  ariaLabel: string;
  /** Columns at sm+. Defaults to the option count, capped at 3. */
  columns?: 2 | 3;
}

export function SegmentedOptions<T extends string>({
  value,
  onChange,
  options,
  ariaLabel,
  columns,
}: SegmentedOptionsProps<T>) {
  const cols = columns ?? (Math.min(options.length, 3) as 2 | 3);
  const colsClass = cols === 2 ? "sm:grid-cols-2" : "sm:grid-cols-3";

  return (
    // <fieldset> + visually-hidden <legend>: gives screen readers a
    // labelled grouping without using `role="radio"`/`role="group"`,
    // which biome's `useSemanticElements` lint nudges away from.
    // Inner controls remain plain `<button aria-pressed>` (matching the
    // pre-rebrand picker); arrow-key navigation isn't required for
    // these short two/three-option lists.
    <fieldset className={cn("grid gap-3 border-0 p-0", colsClass)}>
      <legend className="sr-only">{ariaLabel}</legend>
      {options.map((opt) => {
        const selected = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(opt.value)}
            className={cn(
              "flex flex-col gap-1 rounded-md border px-4 py-3 text-left text-sm transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              selected
                ? "border-primary bg-primary/5 ring-1 ring-primary/40"
                : "border-border hover:bg-muted/50",
            )}
          >
            <span className="font-medium text-foreground">{opt.label}</span>
            {opt.description ? (
              <span className="text-xs text-muted-foreground">{opt.description}</span>
            ) : null}
          </button>
        );
      })}
    </fieldset>
  );
}
