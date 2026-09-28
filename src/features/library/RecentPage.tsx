// Recent (wireframe screen 14): the 50 most recently edited files,
// grouped Today / Yesterday / This week / Earlier, with a location column.
// Grouping applies while sorted by Modified ↓; any other sort is flat.

import { Clock01Icon } from "@hugeicons/core-free-icons";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { PageFrame, PageToolbar, StatusBar, ToolbarSearch } from "@/components/shell/page";
import { useFolders } from "@/data/folders";
import { files } from "@/lib/api/client";
import { keys } from "@/lib/api/query-keys";
import { fmtShortDate, groupRecent } from "./helpers";
import { LibraryItemsView, useLibraryView, ViewSwitch } from "./LibraryItemsView";
import { type LibrarySortKey, sortLibraryItems, toLibraryItems } from "./libraryItems";
import {
  type KindFilter,
  KindFilterMenu,
  matchesKind,
  matchesQuery,
  SelectedCount,
  useScopeSelectionCount,
  useToggleSort,
} from "./parts";

const SCOPE = "recent";
const RECENT_QUERY = { limit: 50 } as const;

export function RecentPage() {
  const folders = useFolders();
  const list = useQuery({
    queryKey: keys.files.list(RECENT_QUERY),
    queryFn: () => files.list(RECENT_QUERY),
  });
  const [q, setQ] = useState("");
  const [kind, setKind] = useState<KindFilter>("all");
  const [sort, onSort] = useToggleSort<LibrarySortKey>({ key: "modified", dir: "desc" });
  const selected = useScopeSelectionCount(SCOPE);
  const [view, setView] = useLibraryView("list");

  const items = useMemo(() => {
    const all = toLibraryItems({ files: list.data ?? [], allFolders: folders.data ?? [] });
    return sortLibraryItems(
      all.filter((i) => matchesKind(i, kind) && matchesQuery(i, q)),
      sort,
    );
  }, [list.data, folders.data, kind, q, sort]);

  const grouped = view === "list" && sort.key === "modified" && sort.dir === "desc";
  const groups = useMemo(
    () => (grouped ? groupRecent(items, (i) => i.updatedAt, Date.now()) : [{ items }]),
    [grouped, items],
  );

  return (
    <PageFrame>
      <PageToolbar
        icon={Clock01Icon}
        title="Recent"
        right={
          <>
            <ToolbarSearch value={q} onChange={setQ} placeholder="Filter recent" />
            <ViewSwitch view={view} onChange={setView} />
          </>
        }
      >
        <span className="text-xs text-muted-foreground">Recently edited files</span>
        <KindFilterMenu value={kind} onChange={setKind} includeFolders={false} />
      </PageToolbar>
      <LibraryItemsView
        view={view}
        meta={(i) => `${i.location} · ${fmtShortDate(i.updatedAt, Date.now())}`}
        scope={SCOPE}
        label="Recent files"
        groups={groups}
        columns={["location", "modified", "kind", "size"]}
        sort={sort}
        onSort={onSort}
        emptyText={
          list.isPending ? "Loading…" : q || kind !== "all" ? "No matches." : "Nothing edited yet."
        }
      />
      <StatusBar
        left={
          <>
            <span>
              <b className="font-semibold text-foreground">{items.length}</b> recent files
            </span>
            <SelectedCount n={selected} />
          </>
        }
      />
    </PageFrame>
  );
}
