// Tag view (/tags/:tag): files (`GET /api/files?tag=`) + folders carrying
// the tag.

import { HashtagIcon } from "@hugeicons/core-free-icons";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import {
  FilterBar,
  PageFrame,
  PageTitle,
  PageToolbar,
  StatusBar,
  ToolbarSearch,
} from "@/components/shell/page";
import { tagColor } from "@/components/shell/tagColor";
import { useFolders } from "@/data/folders";
import { files } from "@/lib/api/client";
import { keys } from "@/lib/api/query-keys";
import { LibraryItemsView, useLibraryView, ViewSwitch } from "./LibraryItemsView";
import { type LibrarySortKey, sortLibraryItems, toLibraryItems } from "./libraryItems";
import {
  KindChips,
  type KindFilter,
  matchesKind,
  matchesQuery,
  SelectedCount,
  useScopeSelectionCount,
  useToggleSort,
} from "./parts";

export function TagPage() {
  const { tag = "" } = useParams<{ tag: string }>();
  const scope = `tag:${tag}`;
  const query = useMemo(() => ({ tags: [tag] }), [tag]);
  const folders = useFolders();
  const list = useQuery({
    queryKey: keys.files.list(query),
    queryFn: () => files.list(query),
    enabled: !!tag,
  });
  const [q, setQ] = useState("");
  const [kind, setKind] = useState<KindFilter>("all");
  const [sort, onSort] = useToggleSort<LibrarySortKey>({ key: "name", dir: "asc" });
  const selected = useScopeSelectionCount(scope);
  const [view, setView] = useLibraryView();

  const items = useMemo(() => {
    const lower = tag.toLowerCase();
    const all = toLibraryItems({
      files: list.data ?? [],
      folders: (folders.data ?? []).filter((f) => f.tags.some((t) => t.toLowerCase() === lower)),
      allFolders: folders.data ?? [],
    });
    return sortLibraryItems(
      all.filter((i) => matchesKind(i, kind) && matchesQuery(i, q)),
      sort,
      true,
    );
  }, [list.data, folders.data, kind, q, sort, tag]);

  const nFolders = items.filter((i) => i.ref.type === "folder").length;

  return (
    <PageFrame>
      <PageToolbar
        icon={HashtagIcon}
        title={
          <span className="flex items-center gap-2">
            <span className="size-2.5 rounded-full" style={{ background: tagColor(tag) }} />
            <PageTitle>{tag}</PageTitle>
          </span>
        }
        right={
          <>
            <ToolbarSearch value={q} onChange={setQ} placeholder={`Filter #${tag}`} />
            <ViewSwitch view={view} onChange={setView} />
          </>
        }
      />
      <FilterBar>
        <KindChips value={kind} onChange={setKind} />
      </FilterBar>
      <LibraryItemsView
        view={view}
        meta={(i) => i.location}
        key={tag}
        scope={scope}
        label={`Items tagged ${tag}`}
        groups={[{ items }]}
        columns={["location", "modified", "kind", "tags"]}
        sort={sort}
        onSort={onSort}
        emptyText={list.isPending ? "Loading…" : `Nothing tagged #${tag}.`}
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
