// ViewToolbar — the filter/sort/layout strip above every file list.
//
// One component for the folder browser, All files and tag views so the
// controls never drift apart. All state lives in the URL via
// `useViewParams`, so the toolbar is stateless.

import {
  ArrowDataTransferVerticalIcon,
  Cancel01Icon,
  FilterIcon,
  GridViewIcon,
  ListViewIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { ReactNode } from "react";

import { FileKindGlyph } from "@/components/file-kinds/file-kind-icons";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Segmented } from "@/components/ui/segmented";
import { FILE_KIND_LIST, fileKindInfo } from "@/lib/file-kinds";

import { SORT_LABELS, type SortKey, type ViewParams } from "./lib/useViewParams";

export function ViewToolbar({
  view,
  count,
  actions,
}: {
  view: ViewParams;
  /** Result count rendered on the left. */
  count: ReactNode;
  /** Optional extra buttons rendered before the filters (e.g. "New folder"). */
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="mr-auto flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
        {count}
        {view.q ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-foreground">
            “{view.q}”
            <button type="button" onClick={() => view.setQ("")} aria-label="Clear search">
              <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} className="size-3" />
            </button>
          </span>
        ) : null}
        {view.kind ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-foreground">
            {fileKindInfo(view.kind).label}
            <button type="button" onClick={() => view.setKind(null)} aria-label="Clear type filter">
              <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} className="size-3" />
            </button>
          </span>
        ) : null}
      </div>

      {actions}

      {/* Type filter */}
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="outline" size="sm" />}>
          <HugeiconsIcon icon={FilterIcon} strokeWidth={1.8} />
          <span className="hidden sm:inline">
            {view.kind ? fileKindInfo(view.kind).label : "All types"}
          </span>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" sideOffset={4} className="min-w-44">
          <DropdownMenuItem onClick={() => view.setKind(null)}>All types</DropdownMenuItem>
          <DropdownMenuSeparator />
          {FILE_KIND_LIST.map((k) => (
            <DropdownMenuItem key={k.id} onClick={() => view.setKind(k.id)}>
              <FileKindGlyph kind={k.id} className="size-4" />
              {k.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Sort */}
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="outline" size="sm" />}>
          <HugeiconsIcon icon={ArrowDataTransferVerticalIcon} strokeWidth={1.8} />
          <span className="hidden sm:inline">{SORT_LABELS[view.sort]}</span>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" sideOffset={4} className="min-w-44">
          {(Object.keys(SORT_LABELS) as SortKey[]).map((k) => (
            <DropdownMenuItem key={k} onClick={() => view.setSort(k)}>
              {SORT_LABELS[k]}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Layout */}
      <Segmented
        label="Layout"
        value={view.layout}
        onChange={view.setLayout}
        items={[
          {
            value: "grid",
            label: "Grid",
            render: <HugeiconsIcon icon={GridViewIcon} strokeWidth={1.8} className="size-3.5" />,
          },
          {
            value: "list",
            label: "List",
            render: <HugeiconsIcon icon={ListViewIcon} strokeWidth={1.8} className="size-3.5" />,
          },
        ]}
      />
    </div>
  );
}
