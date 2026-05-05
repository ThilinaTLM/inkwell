// Filter strip for the SharesPage: search input + two segmented
// pickers (target type, permission). Presentational; the parent owns
// state via `useSharesFilter`.

import { Search01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { PermissionFilter, TargetTypeFilter } from "./useSharesFilter";

export function SharesFilters({
  search,
  onSearchChange,
  typeFilter,
  onTypeFilterChange,
  permFilter,
  onPermFilterChange,
}: {
  search: string;
  onSearchChange: (next: string) => void;
  typeFilter: TargetTypeFilter;
  onTypeFilterChange: (next: TargetTypeFilter) => void;
  permFilter: PermissionFilter;
  onPermFilterChange: (next: PermissionFilter) => void;
}) {
  return (
    <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-center">
      <div className="relative flex-1">
        <HugeiconsIcon
          icon={Search01Icon}
          strokeWidth={2}
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          type="search"
          placeholder="Search by label or target…"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          className="pl-9"
        />
      </div>
      <SegmentedFilter
        value={typeFilter}
        onChange={onTypeFilterChange}
        options={[
          { value: "all", label: "All" },
          { value: "file", label: "Files" },
          { value: "folder", label: "Folders" },
        ]}
      />
      <SegmentedFilter
        value={permFilter}
        onChange={onPermFilterChange}
        options={[
          { value: "all", label: "All" },
          { value: "read", label: "View" },
          { value: "write", label: "Edit" },
        ]}
      />
    </div>
  );
}

function SegmentedFilter<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <div className="inline-flex items-center rounded-md border border-border bg-card/50 p-0.5">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          data-active={value === opt.value}
          className={cn(
            "rounded px-3 py-1.5 text-xs font-medium transition-colors",
            "data-[active=true]:bg-accent data-[active=true]:text-accent-foreground",
            "text-muted-foreground hover:text-foreground",
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
