// Columns (Miller) view — screen 04. One column per folder on the URL
// path (Home → … → current folder) plus a preview column. Clicking or
// arrowing onto a folder steps into it (URL updates); ←/→ move between
// columns, ↑/↓ within a column. Items can be dragged between columns;
// every column background is a drop target for its folder.

import { ArrowRight01Icon, MoreHorizontalIcon, Share08Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useQueries } from "@tanstack/react-query";
import { memo, useEffect, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { itemActions } from "@/features/actions/useItemActions";
import { folderPath } from "@/features/folders/FolderTree";
import { type FolderMeta, files as filesApi } from "@/lib/api/client";
import { keys } from "@/lib/api/query-keys";
import { cn } from "@/lib/utils";
import { type ExplorerItem, fileToItem, folderToItem } from "../model";
import type { NavKey } from "../selection-logic";
import { getSelState, requestPendingSelection, useSelectedKeys } from "../state";
import { Collection, type ExplorerViewProps, itemStateClass, useItemBindings } from "./collection";
import { ItemName } from "./ItemName";
import { ItemPreview } from "./ItemPreview";
import { ItemIcon, StarMark } from "./ItemVisuals";

export interface ColumnsViewProps extends Omit<ExplorerViewProps, "items" | "folderId" | "empty"> {
  folderId: string | null;
  /** The whole folder tree (`useFolders().data`). */
  folders: FolderMeta[];
  /** Sort / filter each column's items. */
  prepare?: (items: ExplorerItem[]) => ExplorerItem[];
}

interface Column {
  folderId: string | null;
  name: string;
  items: ExplorerItem[];
  loading: boolean;
}

export function ColumnsView({ folderId, folders, prepare, ...props }: ColumnsViewProps) {
  const navigate = useNavigate();
  const path = useMemo<Array<string | null>>(
    () => [null, ...(folderId ? folderPath(folders, folderId).map((f) => f.id) : [])],
    [folders, folderId],
  );
  const results = useQueries({
    queries: path.map((id) => {
      const q = { folderId: id ?? "root" } as const;
      return { queryKey: keys.files.list(q), queryFn: () => filesApi.list(q) };
    }),
  });

  const byParent = useMemo(() => {
    const m = new Map<string | null, FolderMeta[]>();
    for (const f of folders) {
      const arr = m.get(f.parentId) ?? [];
      arr.push(f);
      m.set(f.parentId, arr);
    }
    return m;
  }, [folders]);

  const columns: Column[] = path.map((id, i) => {
    const data = results[i]?.data;
    const raw = [
      ...(byParent.get(id) ?? []).map(folderToItem),
      ...(data ?? []).map((f) => fileToItem(f)),
    ];
    return {
      folderId: id,
      name: id === null ? "Home" : (folders.find((f) => f.id === id)?.name ?? "Folder"),
      items: prepare ? prepare(raw) : raw,
      loading: !data,
    };
  });
  const all = columns.flatMap((c) => c.items);
  const colOf = new Map<string, number>();
  columns.forEach((c, i) => {
    for (const it of c.items) colOf.set(it.key, i);
  });

  const go = (target: string | null, selectKey: string | null, replace = false) => {
    if (selectKey) requestPendingSelection([selectKey]);
    navigate(target ? `/folders/${target}` : "/", { replace });
  };

  // Plain click: folders step in; files in an earlier column truncate the path.
  const onItemClick = (item: ExplorerItem) => {
    const ci = colOf.get(item.key) ?? 0;
    if (item.type === "folder") {
      if (item.id !== folderId) go(item.id, item.key);
    } else if (ci < columns.length - 1) {
      go(columns[ci].folderId, item.key);
    }
  };

  const onNavKey = (key: NavKey, e: React.KeyboardEvent<HTMLElement>): boolean => {
    if (e.shiftKey) return false;
    const cur = getSelState(props.scope).focus;
    const ci = cur ? (colOf.get(cur) ?? -1) : -1;
    if (ci < 0) {
      const first = columns[columns.length - 1]?.items[0] ?? columns[0]?.items[0];
      if (first) select(first, columns.length - 1);
      return true;
    }
    const col = columns[ci];
    const idx = col.items.findIndex((i) => i.key === cur);
    if (key === "up" || key === "down" || key === "home" || key === "end") {
      const n =
        key === "home"
          ? 0
          : key === "end"
            ? col.items.length - 1
            : Math.max(0, Math.min(col.items.length - 1, idx + (key === "up" ? -1 : 1)));
      const it = col.items[n];
      if (it && it.key !== cur) select(it, ci);
      return true;
    }
    if (key === "left") {
      if (ci === 0) return true;
      const parentId = columns[ci].folderId;
      if (parentId) go(parentId, `folder:${parentId}`, true);
      return true;
    }
    if (key === "right") {
      const it = col.items[idx];
      if (it?.type !== "folder") return true;
      const next = columns[ci + 1];
      const first = next?.folderId === it.id ? next.items[0] : undefined;
      if (first) select(first, ci + 1);
      return true;
    }
    return false;
  };

  const select = (item: ExplorerItem, ci: number) => {
    if (item.type === "folder") go(item.id, item.key, true);
    else go(columns[ci].folderId, item.key, true);
  };

  const scroller = useRef<HTMLDivElement>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll when the path grows
  useEffect(() => {
    const host = scroller.current?.parentElement;
    if (host) host.scrollLeft = host.scrollWidth;
  }, [path.length]);

  const pathSet = new Set(path.filter((p): p is string => !!p).map((id) => `folder:${id}`));

  return (
    <Collection
      {...props}
      items={all}
      folderId={folderId}
      layout={() => ({ type: "list" })}
      onNavKey={onNavKey}
      onItemClick={onItemClick}
      marquee={false}
      onOpen={
        props.onOpen ?? ((i) => (i.type === "folder" ? go(i.id, i.key) : itemActions.open(i.ref)))
      }
    >
      <div ref={scroller} className="flex h-full min-h-full w-max min-w-full">
        {columns.map((c, i) => (
          <fieldset
            key={c.folderId ?? "root"}
            aria-label={c.name}
            data-drop-folder={props.readOnly ? undefined : (c.folderId ?? "root")}
            data-drop-name={c.name}
            className="h-full w-[250px] shrink-0 overflow-y-auto border-r border-border p-1.5 data-[drop-over=true]:bg-accent/40 data-[file-drop-over=true]:bg-accent/40"
          >
            {c.items.map((it) => (
              <MillerRow
                key={it.key}
                item={it}
                onPath={pathSet.has(it.key) && i < columns.length - 1}
              />
            ))}
            {!c.loading && c.items.length === 0 ? (
              <p className="px-2 py-3 text-xs text-muted-foreground/70">Empty folder</p>
            ) : null}
          </fieldset>
        ))}
        <PreviewColumn scope={props.scope} items={all} />
      </div>
    </Collection>
  );
}

const MillerRow = memo(function MillerRow({
  item,
  onPath,
}: {
  item: ExplorerItem;
  onPath: boolean;
}) {
  const { props, state, onRenameDone } = useItemBindings(item);
  return (
    <div
      {...props}
      className={cn(
        "flex h-[30px] min-w-0 cursor-default items-center gap-2 rounded-md border border-transparent px-2 text-[12.5px] font-medium text-foreground",
        onPath && !state.selected && "bg-muted",
        itemStateClass(state),
      )}
    >
      <ItemIcon kind={item.kind} />
      <ItemName
        item={item}
        state={state}
        onRenameDone={onRenameDone}
        className="min-w-0 flex-1 truncate"
      />
      {item.starred ? <StarMark /> : null}
      {item.type === "folder" ? (
        <HugeiconsIcon
          icon={ArrowRight01Icon}
          strokeWidth={2}
          className="size-3 shrink-0 text-muted-foreground"
        />
      ) : null}
    </div>
  );
});

function PreviewColumn({ scope, items }: { scope: string; items: ExplorerItem[] }) {
  const sel = useSelectedKeys(scope);
  const item = sel.length === 1 ? items.find((i) => i.key === sel[0]) : undefined;
  return (
    <div data-no-marquee="" className="min-w-[280px] flex-1 overflow-y-auto p-4">
      {item && item.type === "file" ? (
        <>
          <ItemPreview item={item} />
          <div className="mt-3.5 flex gap-1.5">
            <Button size="sm" onClick={() => itemActions.open(item.ref)}>
              Open ↵
            </Button>
            <Button size="sm" variant="outline" onClick={() => itemActions.share(item.ref)}>
              <HugeiconsIcon icon={Share08Icon} strokeWidth={2} />
              Share
            </Button>
            <Button
              size="sm"
              variant="outline"
              aria-label="More actions"
              onClick={(e) => {
                const r = e.currentTarget.getBoundingClientRect();
                const row = document.querySelector(`[data-explorer-pane] [data-key="${item.key}"]`);
                row?.dispatchEvent(
                  new MouseEvent("contextmenu", {
                    bubbles: true,
                    cancelable: true,
                    clientX: r.left,
                    clientY: r.bottom,
                  }),
                );
              }}
            >
              <HugeiconsIcon icon={MoreHorizontalIcon} strokeWidth={2} />
            </Button>
          </div>
        </>
      ) : sel.length > 1 ? (
        <p className="font-display text-lg italic text-muted-foreground">
          {sel.length} items selected
        </p>
      ) : null}
    </div>
  );
}
