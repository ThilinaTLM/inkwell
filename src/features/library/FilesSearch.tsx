// The single search/filter field used by every Files-hub tab.

import { Cancel01Icon, Search01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { cn } from "@/lib/utils";

export function FilesSearch({
  value,
  onChange,
  placeholder = "Filter",
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <label
      className={cn(
        "flex h-8 w-56 items-center gap-2 rounded-lg border border-input bg-card px-2.5 text-muted-foreground transition-colors focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/30 max-sm:w-full",
        className,
      )}
    >
      <HugeiconsIcon icon={Search01Icon} strokeWidth={1.8} className="size-3.5 shrink-0" />
      <input
        data-toolbar-search
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape" && value) {
            e.preventDefault();
            e.stopPropagation();
            onChange("");
          }
        }}
        placeholder={placeholder}
        aria-label={placeholder}
        className="min-w-0 flex-1 bg-transparent text-[13px] text-foreground outline-none placeholder:text-faint [&::-webkit-search-cancel-button]:hidden"
      />
      {value ? (
        <button
          type="button"
          aria-label="Clear filter"
          onClick={() => onChange("")}
          className="grid size-4 place-items-center rounded text-muted-foreground hover:text-foreground"
        >
          <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} className="size-3" />
        </button>
      ) : null}
    </label>
  );
}
