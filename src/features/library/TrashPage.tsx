// Trash (wireframe screen 14): top-level trashed items with original
// location, deletion date and purge countdown. Restore / Delete forever
// (confirm) / Empty trash (confirm). Selection is published to the global
// store (scope "trash") so `item.restore` / `item.purge` (Delete, ⌘⌫)
// and the context menu act on it; ⌘Z right after trashing is handled by
// the undo stack.

import { Delete02Icon, RestoreBinIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { PageFrame, PageToolbar, StatusBar, ToolbarSearch } from "@/components/shell/page";
import { Button } from "@/components/ui/button";
import { ContextMenu, ContextMenuContent, ContextMenuTrigger } from "@/components/ui/context-menu";
import { useItemActions } from "@/features/actions/useItemActions";
import { type TrashItem, trash } from "@/lib/api/client";
import { keys } from "@/lib/api/query-keys";
import { CommandMenuItems } from "@/lib/commands/CommandMenuItems";
import { cn } from "@/lib/utils";
import { fmtBytes, fmtShortDate, purgeCountdown, purgeIsSoon } from "./helpers";
import { ItemIcon } from "./ItemTable";
import { CheckTd, CheckTh, EmptyRow, ListRow, ListTable, RowActions, Td, Th } from "./ListTable";
import { SelectedCount, useScopeSelectionCount, useToggleSort } from "./parts";
import { useItemSelState, useListSelection } from "./useListSelection";

const SCOPE = "trash";

type TrashSortKey = "name" | "location" | "deleted" | "purge" | "size";

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

function sortTrash(list: TrashItem[], sort: { key: TrashSortKey; dir: "asc" | "desc" }) {
  const sign = sort.dir === "asc" ? 1 : -1;
  return [...list].sort((a, b) => {
    switch (sort.key) {
      case "name":
        return sign * collator.compare(a.name, b.name);
      case "location":
        return sign * collator.compare(a.originalPath, b.originalPath);
      case "deleted":
        return sign * (a.deletedAt - b.deletedAt);
      case "purge":
        return sign * (a.purgeAt - b.purgeAt);
      default:
        return sign * ((a.sizeBytes ?? -1) - (b.sizeBytes ?? -1));
    }
  });
}

export function TrashPage() {
  const actions = useItemActions();
  const list = useQuery({ queryKey: keys.trash.list(), queryFn: () => trash.list() });
  const [q, setQ] = useState("");
  const [sort, onSort] = useToggleSort<TrashSortKey>({ key: "deleted", dir: "desc" });
  const selectedCount = useScopeSelectionCount(SCOPE);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const filtered = (list.data ?? []).filter(
      (t) => !needle || `${t.name} ${t.originalPath}`.toLowerCase().includes(needle),
    );
    return sortTrash(filtered, sort);
  }, [list.data, q, sort]);

  const order = useMemo(() => rows.map((r) => `${r.type}:${r.id}`), [rows]);
  const selection = useListSelection(order, useItemSelState(SCOPE), { listenSelectAll: true });
  const total = list.data?.length ?? 0;
  const now = Date.now();
  const colSpan = 7;

  return (
    <PageFrame>
      <PageToolbar
        icon={Delete02Icon}
        title="Trash"
        right={
          <>
            <ToolbarSearch value={q} onChange={setQ} placeholder="Filter trash" />
            <Button
              variant="destructive"
              size="sm"
              disabled={total === 0}
              onClick={() => void actions.emptyTrash()}
            >
              <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} />
              Empty trash
            </Button>
          </>
        }
      >
        <span className="truncate text-xs text-muted-foreground">
          Items are deleted forever after 30 days
        </span>
      </PageToolbar>
      <ContextMenu>
        <ContextMenuTrigger className="flex min-h-0 flex-1 flex-col">
          <ListTable label="Trash" selection={selection}>
            <thead>
              <tr>
                <CheckTh selection={selection} />
                <Th sortKey="name" sort={sort} onSort={onSort}>
                  Name
                </Th>
                <Th sortKey="location" sort={sort} onSort={onSort}>
                  Original location
                </Th>
                <Th sortKey="deleted" sort={sort} onSort={onSort}>
                  Deleted
                </Th>
                <Th sortKey="purge" sort={sort} onSort={onSort}>
                  Purges in
                </Th>
                <Th sortKey="size" sort={sort} onSort={onSort} align="right">
                  Size
                </Th>
                <Th className="w-[210px]" />
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <EmptyRow colSpan={colSpan}>
                  {list.isPending ? "Loading…" : q ? "No matches." : "Trash is empty."}
                </EmptyRow>
              ) : null}
              {rows.map((t) => {
                const key = `${t.type}:${t.id}`;
                const ref = { type: t.type, id: t.id };
                return (
                  <ListRow key={key} rowKey={key} selection={selection}>
                    <CheckTd rowKey={key} selection={selection} />
                    <Td primary className="max-w-[360px]">
                      <span className="flex min-w-0 items-center gap-2">
                        <ItemIcon kind={t.kind} />
                        <span className="truncate">{t.name}</span>
                        {t.type === "folder" && t.itemCount ? (
                          <span className="text-[11px] font-normal text-muted-foreground">
                            {t.itemCount} {t.itemCount === 1 ? "item" : "items"}
                          </span>
                        ) : null}
                      </span>
                    </Td>
                    <Td title={t.originalPath}>{t.originalPath}</Td>
                    <Td>{fmtShortDate(t.deletedAt, now)}</Td>
                    <Td
                      className={cn(purgeIsSoon(t.purgeAt, now) && "text-destructive")}
                      title={new Date(t.purgeAt).toLocaleString()}
                    >
                      {purgeCountdown(t.purgeAt, now)}
                    </Td>
                    <Td align="right">{t.sizeBytes ? fmtBytes(t.sizeBytes) : "—"}</Td>
                    <Td className="py-0">
                      <RowActions>
                        <Button
                          variant="outline"
                          size="xs"
                          className="h-6 px-2 text-[11px]"
                          onClick={(e) => {
                            e.stopPropagation();
                            void actions.restore([ref]);
                          }}
                        >
                          <HugeiconsIcon icon={RestoreBinIcon} strokeWidth={2} />
                          Restore
                        </Button>
                        <Button
                          variant="destructive"
                          size="xs"
                          className="h-6 px-2 text-[11px]"
                          onClick={(e) => {
                            e.stopPropagation();
                            void actions.purge([ref]);
                          }}
                        >
                          Delete forever
                        </Button>
                      </RowActions>
                    </Td>
                  </ListRow>
                );
              })}
            </tbody>
          </ListTable>
        </ContextMenuTrigger>
        <ContextMenuContent className="min-w-52">
          <CommandMenuItems
            as="context"
            ids={
              selection.count
                ? ["item.restore", "item.purge", "-", "trash.empty"]
                : ["select.all", "-", "trash.empty"]
            }
          />
        </ContextMenuContent>
      </ContextMenu>
      <StatusBar
        left={
          <>
            <span>
              <b className="font-semibold text-foreground">{total}</b> items in Trash
            </span>
            {selectedCount ? (
              <>
                <SelectedCount n={selectedCount} />
                <span>Delete to delete forever</span>
              </>
            ) : null}
          </>
        }
      />
    </PageFrame>
  );
}
