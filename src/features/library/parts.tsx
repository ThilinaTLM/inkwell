// Small shared pieces for the library pages.
//
// PUBLIC CONTRACT
//   type KindFilter = "all" | FileKind | "folder"
//   <KindChips value onChange includeFolders? />   – FilterBar chip group
//   matchesKind(item, filter) / matchesQuery(item, q)
//   useScopeSelectionCount(scope): number
//   <SelectedCount n />                             – "· 2 selected" (accent) or nothing
//   useToggleSort(initial): [sort, onSort]          – header click toggles dir, new key → asc
//                                                     (dates default to desc)

import { useCallback, useState } from "react";
import { FilterChip } from "@/components/shell/page";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { FileKind } from "@/lib/api/client";
import { useSelection } from "@/lib/selection";
import type { SortState } from "./ListTable";
import type { LibraryItem } from "./libraryItems";

export type KindFilter = "all" | FileKind | "folder";

const KIND_CHIPS: Array<{ value: KindFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "folder", label: "Folders" },
  { value: "excalidraw", label: "Excalidraw" },
  { value: "drawio", label: "draw.io" },
  { value: "notes", label: "Markdown" },
  { value: "static-site", label: "Sites" },
];

export function KindChips({
  value,
  onChange,
  includeFolders = true,
}: {
  value: KindFilter;
  onChange: (v: KindFilter) => void;
  includeFolders?: boolean;
}) {
  return (
    <>
      <span className="pr-0.5">Kind</span>
      {KIND_CHIPS.filter((c) => includeFolders || c.value !== "folder").map((c) => (
        <FilterChip
          key={c.value}
          active={value === c.value}
          onClick={() => onChange(value === c.value && c.value !== "all" ? "all" : c.value)}
        >
          {c.label}
        </FilterChip>
      ))}
    </>
  );
}

export function KindFilterMenu({
  value,
  onChange,
  includeFolders = true,
}: {
  value: KindFilter;
  onChange: (value: KindFilter) => void;
  includeFolders?: boolean;
}) {
  const options = KIND_CHIPS.filter((item) => includeFolders || item.value !== "folder");
  const label = options.find((item) => item.value === value)?.label ?? "All";
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="outline" size="sm" className="h-7" />}>
        Kind: {label}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-44">
        <DropdownMenuLabel>Kind</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={value}
          onValueChange={(next) => onChange(next as KindFilter)}
        >
          {options.map((item) => (
            <DropdownMenuRadioItem key={item.value} value={item.value}>
              {item.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function matchesKind(item: Pick<LibraryItem, "kind" | "ref">, f: KindFilter): boolean {
  if (f === "all") return true;
  if (f === "folder") return item.ref.type === "folder";
  return item.kind === f;
}

export function matchesQuery(item: Pick<LibraryItem, "name" | "location" | "tags">, q: string) {
  const n = q.trim().toLowerCase();
  if (!n) return true;
  return `${item.name} ${item.location} ${item.tags.join(" ")}`.toLowerCase().includes(n);
}

export function useScopeSelectionCount(scope: string): number {
  const s = useSelection();
  return s.scope === scope ? s.items.length : 0;
}

export function SelectedCount({ n }: { n: number }) {
  if (!n) return null;
  return <b className="font-semibold text-accent-foreground">{n} selected</b>;
}

const DESC_FIRST = new Set([
  "modified",
  "created",
  "deleted",
  "starred",
  "lastLogin",
  "expires",
  "purge",
  "size",
  "files",
]);

export function useToggleSort<K extends string>(
  initial: SortState<K>,
): [SortState<K>, (key: K) => void] {
  const [sort, setSort] = useState(initial);
  const onSort = useCallback((key: K) => {
    setSort((s) =>
      s.key === key
        ? { key, dir: s.dir === "asc" ? "desc" : "asc" }
        : { key, dir: DESC_FIRST.has(key) ? "desc" : "asc" },
    );
  }, []);
  return [sort, onSort];
}
