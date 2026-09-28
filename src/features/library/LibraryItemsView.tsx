// View switcher for the library pages (Recent / Starred / Tag): Grid and
// Compact reuse the explorer's views (`@/features/explorer/views`);
// Details (and Columns, which has no meaning off the folder tree) use the
// library ItemTable, which adds day groups and the location column.
// The chosen view is remembered per route (`route:/recent` …) through
// `useFolderView`, so the 1–3 keys (view.* commands) work here too.
//
// PUBLIC CONTRACT
//   useLibraryView(fallback?): [view: "grid" | "compact" | "list", setView]
//   <ViewSwitch view onChange />                     – toolbar segment (grid · compact · details)
//   <LibraryItemsView view scope label groups columns sort onSort emptyText meta? />

import { GridViewIcon, LeftToRightListBulletIcon, Menu01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import { useMemo } from "react";
import { useLocation } from "react-router-dom";
import { fileToItem, folderToItem } from "@/features/explorer/model";
import { CompactView, GridView } from "@/features/explorer/views";
import { formatKeys } from "@/lib/commands/keymap";
import { getEffectiveKeys } from "@/lib/commands/registry";
import { type ExplorerView, hasFolderView, useFolderView, viewKeyFor } from "@/lib/explorerPrefs";
import { cn } from "@/lib/utils";
import { type ItemColumn, ItemTable, LIBRARY_ITEM_MENU_IDS } from "./ItemTable";
import type { SortState } from "./ListTable";
import type { LibraryItem, LibrarySortKey } from "./libraryItems";

export type LibraryView = "grid" | "compact" | "list";

/** `fallback` applies until the user picks a view on this page (Recent
 *  defaults to Details so its day groups and location column show). */
export function useLibraryView(fallback?: LibraryView): [LibraryView, (v: ExplorerView) => void] {
  const { pathname } = useLocation();
  const key = viewKeyFor({ currentFolderId: undefined, route: pathname }) ?? pathname;
  const [stored, setView] = useFolderView(key);
  const view = fallback && !hasFolderView(key) ? fallback : stored;
  return [view === "grid" || view === "compact" ? view : "list", setView];
}

const VIEWS: Array<{ view: LibraryView; label: string; icon: IconSvgElement; cmd: string }> = [
  { view: "grid", label: "Grid view", icon: GridViewIcon, cmd: "view.grid" },
  { view: "compact", label: "Compact view", icon: Menu01Icon, cmd: "view.compact" },
  { view: "list", label: "Details view", icon: LeftToRightListBulletIcon, cmd: "view.list" },
];

export function ViewSwitch({
  view,
  onChange,
}: {
  view: LibraryView;
  onChange: (v: LibraryView) => void;
}) {
  return (
    <fieldset className="flex h-7 items-center gap-0.5 rounded-md border border-border p-0.5">
      <legend className="sr-only">View</legend>
      {VIEWS.map((v) => {
        const keys = formatKeys(getEffectiveKeys(v.cmd));
        return (
          <button
            key={v.view}
            type="button"
            aria-pressed={view === v.view}
            aria-label={v.label}
            title={keys ? `${v.label} (${keys})` : v.label}
            onClick={() => onChange(v.view)}
            className={cn(
              "inline-flex size-[22px] items-center justify-center rounded text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40",
              view === v.view && "bg-accent text-accent-foreground hover:bg-accent",
            )}
          >
            <HugeiconsIcon icon={v.icon} strokeWidth={1.8} className="size-3.5" />
          </button>
        );
      })}
    </fieldset>
  );
}

export function LibraryItemsView({
  view,
  scope,
  label,
  groups,
  columns,
  sort,
  onSort,
  emptyText,
  meta,
}: {
  view: LibraryView;
  scope: string;
  label: string;
  groups: Array<{ label?: string; items: LibraryItem[] }>;
  columns: ItemColumn[];
  sort?: SortState<LibrarySortKey>;
  onSort?: (key: LibrarySortKey) => void;
  emptyText: string;
  /** Grid secondary line (defaults to the explorer's). */
  meta?: (item: LibraryItem) => string;
}) {
  const flat = useMemo(() => groups.flatMap((g) => g.items), [groups]);
  const explorerItems = useMemo(
    () =>
      flat.map((i) =>
        i.folder ? folderToItem(i.folder) : fileToItem(i.file as NonNullable<LibraryItem["file"]>),
      ),
    [flat],
  );
  const byKey = useMemo(() => new Map(flat.map((i) => [i.key, i])), [flat]);

  if (view === "list") {
    return (
      <ItemTable
        scope={scope}
        label={label}
        groups={groups}
        columns={columns}
        sort={sort}
        onSort={onSort}
        emptyText={emptyText}
      />
    );
  }
  const empty = (
    <p className="py-16 text-center font-hand text-xl text-muted-foreground">{emptyText}</p>
  );
  const menu = { item: LIBRARY_ITEM_MENU_IDS, background: null, moveTo: true };
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {view === "grid" ? (
        <GridView
          items={explorerItems}
          scope={scope}
          ariaLabel={label}
          menu={menu}
          empty={empty}
          groupHeaders={false}
          meta={
            meta
              ? (e) => {
                  const li = byKey.get(e.key);
                  return li ? meta(li) : "";
                }
              : undefined
          }
        />
      ) : (
        <CompactView
          items={explorerItems}
          scope={scope}
          ariaLabel={label}
          menu={menu}
          empty={empty}
        />
      )}
    </div>
  );
}
