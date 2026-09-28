// Starred (wireframe screen 14): starred files + folders, newest star
// first (no manual reorder — plan sec. 2 deviation).

import { StarIcon } from "@hugeicons/core-free-icons";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { PageFrame, PageToolbar, StatusBar, ToolbarSearch } from "@/components/shell/page";
import { useFolders } from "@/data/folders";
import { files } from "@/lib/api/client";
import { keys } from "@/lib/api/query-keys";
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

const SCOPE = "starred";
// Same key as the sidebar's count query so both share one cache entry.
const STARRED_QUERY = { starred: true } as const;

export function StarredPage() {
  const folders = useFolders();
  const list = useQuery({
    queryKey: keys.files.list(STARRED_QUERY),
    queryFn: () => files.list(STARRED_QUERY),
  });
  const [q, setQ] = useState("");
  const [kind, setKind] = useState<KindFilter>("all");
  const [sort, onSort] = useToggleSort<LibrarySortKey>({ key: "starred", dir: "desc" });
  const selected = useScopeSelectionCount(SCOPE);
  const [view, setView] = useLibraryView();

  const items = useMemo(() => {
    const all = toLibraryItems({
      files: (list.data ?? []).filter((f) => f.starredAt),
      folders: (folders.data ?? []).filter((f) => f.starredAt),
      allFolders: folders.data ?? [],
    });
    return sortLibraryItems(
      all.filter((i) => matchesKind(i, kind) && matchesQuery(i, q)),
      sort,
    );
  }, [list.data, folders.data, kind, q, sort]);

  const nFolders = items.filter((i) => i.ref.type === "folder").length;

  return (
    <PageFrame>
      <PageToolbar
        icon={StarIcon}
        title="Starred"
        right={
          <>
            <ToolbarSearch value={q} onChange={setQ} placeholder="Filter starred" />
            <ViewSwitch view={view} onChange={setView} />
          </>
        }
      >
        <span className="text-xs text-muted-foreground">Pinned items, newest first</span>
        <KindFilterMenu value={kind} onChange={setKind} />
      </PageToolbar>
      <LibraryItemsView
        view={view}
        meta={(i) => i.location}
        scope={SCOPE}
        label="Starred items"
        groups={[{ items }]}
        columns={["location", "starred", "modified", "kind"]}
        sort={sort}
        onSort={onSort}
        emptyText={
          list.isPending
            ? "Loading…"
            : q || kind !== "all"
              ? "No matches."
              : "Star files and folders with S."
        }
      />
      <StatusBar
        left={
          <>
            <span>
              <b className="font-semibold text-foreground">{nFolders}</b> folders ·{" "}
              <b className="font-semibold text-foreground">{items.length - nFolders}</b> files
            </span>
            <SelectedCount n={selected} />
          </>
        }
      />
    </PageFrame>
  );
}
