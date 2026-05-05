// Expiry chip grid. Caller owns the option list (so create and edit
// forms can show different presets — edit adds a "Keep current" chip
// that means "leave expires_at untouched") and the currently selected
// id. The grid switches to a wider track on `sm:` so 5-option layouts
// don't crowd on tablet.

import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export interface ExpiryOption {
  id: string;
  label: string;
}

export function ExpiryChips({
  options,
  value,
  onChange,
  /** Tailwind grid template at the `sm:` breakpoint. Use `sm:grid-cols-4`
   *  for the 4-option create form and `sm:grid-cols-5` for the 5-option
   *  edit form. */
  smGridCols,
}: {
  options: readonly ExpiryOption[];
  value: string;
  onChange: (id: string) => void;
  smGridCols: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      <Label>Expires</Label>
      <div className={cn("grid grid-cols-2 gap-1.5", smGridCols)}>
        {options.map((opt) => (
          <button
            key={opt.id}
            type="button"
            onClick={() => onChange(opt.id)}
            data-active={value === opt.id}
            className="rounded-md border border-border bg-background px-3 py-1.5 text-xs transition-colors data-[active=true]:border-ring data-[active=true]:bg-accent data-[active=true]:text-accent-foreground hover:bg-accent/40"
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}
