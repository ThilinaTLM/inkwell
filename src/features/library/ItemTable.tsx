// Details-view table for files + folders on the library pages (Recent,
// Starred, Tag). Selection lives in the global selection store under
// `scope`, so every item command (↵ open, S star, M move, Delete trash,
// ⌘Z …), the context menu and the palette act on it.
//
// PUBLIC CONTRACT
//   <ItemTable scope label groups columns sort onSort emptyText menuIds? />
//     groups: Array<{ label?: string; items: LibraryItem[] }>  (a single unlabeled group = flat)
//     columns: ItemColumn[] – "location" | "modified" | "kind" | "size" | "tags" | "starred"
//   <ItemIcon kind? size? />     – kind glyph or folder icon
//   LIBRARY_ITEM_MENU_IDS         – row context-menu command ids
//   kindShortLabel(kind?)         – "Excalidraw" · "draw.io" · "Markdown" · "Site" · "Folder"

import { Folder01Icon, Link04Icon, StarIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Fragment, useMemo } from "react";
import { FileKindGlyph } from "@/components/icons/file-kind-icons";
import { tagColor } from "@/components/shell/tagColor";
import { ContextMenu, ContextMenuContent, ContextMenuTrigger } from "@/components/ui/context-menu";
import { useItemActions } from "@/features/actions/useItemActions";
import type { FileKind } from "@/lib/api/client";
import { CommandMenuItems } from "@/lib/commands/CommandMenuItems";
import { useExplorerPref } from "@/lib/explorerPrefs";
import { cn } from "@/lib/utils";
import { fmtBytes, fmtShortDate } from "./helpers";
import {
  CheckTd,
  CheckTh,
  EmptyRow,
  GroupRow,
  ListRow,
  ListTable,
  type SortState,
  Td,
  Th,
} from "./ListTable";
import type { LibraryItem, LibrarySortKey } from "./libraryItems";
import { useItemSelState, useListSelection } from "./useListSelection";

export type ItemColumn = "location" | "modified" | "kind" | "size" | "tags" | "starred";

export const LIBRARY_ITEM_MENU_IDS = [
  "item.open",
  "item.openNewTab",
  "item.reveal",
  "-",
  "item.share",
  "item.copyLink",
  "-",
  "item.star",
  "item.tags",
  "item.move",
  "item.duplicate",
  "item.download",
  "-",
  "item.rename",
  "-",
  "item.trash",
] as const;

export function kindShortLabel(kind?: FileKind): string {
  switch (kind) {
    case "excalidraw":
      return "Excalidraw";
    case "drawio":
      return "draw.io";
    case "notes":
      return "Markdown";
    case "static-site":
      return "Site";
    default:
      return "Folder";
  }
}

export function ItemIcon({ kind, className }: { kind?: FileKind; className?: string }) {
  return kind ? (
    <FileKindGlyph
      kind={kind}
      variant="full"
      className={cn("size-[18px] shrink-0 rounded", className)}
    />
  ) : (
    <HugeiconsIcon
      icon={Folder01Icon}
      strokeWidth={1.7}
      className={cn("size-[18px] shrink-0 text-folder", className)}
    />
  );
}

const COLUMN_LABEL: Record<ItemColumn, string> = {
  location: "Location",
  modified: "Modified",
  kind: "Kind",
  size: "Size",
  tags: "Tags",
  starred: "Starred",
};

const COLUMN_SORT: Partial<Record<ItemColumn, LibrarySortKey>> = {
  location: "location",
  modified: "modified",
  kind: "kind",
  size: "size",
  starred: "starred",
};

export function ItemTable({
  scope,
  label,
  groups,
  columns,
  sort,
  onSort,
  emptyText,
  menuIds = LIBRARY_ITEM_MENU_IDS,
}: {
  scope: string;
  label: string;
  groups: Array<{ label?: string; items: LibraryItem[] }>;
  columns: ItemColumn[];
  sort?: SortState<LibrarySortKey>;
  onSort?: (key: LibrarySortKey) => void;
  emptyText: string;
  menuIds?: readonly string[];
}) {
  const actions = useItemActions();
  const [openWith] = useExplorerPref("openWith");
  const order = useMemo(() => groups.flatMap((g) => g.items.map((i) => i.key)), [groups]);
  const selection = useListSelection(order, useItemSelState(scope), { listenSelectAll: true });
  const colSpan = columns.length + 2;
  const now = Date.now();

  return (
    <ContextMenu>
      <ContextMenuTrigger className="flex min-h-0 flex-1 flex-col">
        <ListTable label={label} selection={selection}>
          <thead>
            <tr>
              <CheckTh selection={selection} />
              <Th sortKey="name" sort={sort} onSort={onSort}>
                Name
              </Th>
              {columns.map((c) => (
                <Th
                  key={c}
                  sortKey={COLUMN_SORT[c]}
                  sort={sort}
                  onSort={onSort}
                  align={c === "size" ? "right" : undefined}
                >
                  {COLUMN_LABEL[c]}
                </Th>
              ))}
            </tr>
          </thead>
          <tbody>
            {order.length === 0 ? <EmptyRow colSpan={colSpan}>{emptyText}</EmptyRow> : null}
            {groups.map((g) => (
              <Fragment key={g.label ?? "all"}>
                {g.label && g.items.length ? (
                  <GroupRow colSpan={colSpan} label={g.label} count={g.items.length} />
                ) : null}
                {g.items.map((it) => (
                  <ListRow
                    key={it.key}
                    rowKey={it.key}
                    selection={selection}
                    onActivate={() => actions.open(it.ref)}
                  >
                    <CheckTd rowKey={it.key} selection={selection} />
                    <Td primary className="max-w-[420px]">
                      <button
                        type="button"
                        tabIndex={-1}
                        className="flex min-w-0 items-center gap-2 text-left"
                        onClick={(e) => {
                          if (openWith === "single" && !e.metaKey && !e.ctrlKey && !e.shiftKey) {
                            e.stopPropagation();
                            actions.open(it.ref);
                          }
                        }}
                      >
                        <ItemIcon kind={it.kind} />
                        <span className="truncate">{it.name}</span>
                        {it.starredAt ? (
                          <HugeiconsIcon
                            icon={StarIcon}
                            strokeWidth={2}
                            aria-label="Starred"
                            className="size-3 shrink-0 fill-primary text-primary"
                          />
                        ) : null}
                        {it.shared ? (
                          <HugeiconsIcon
                            icon={Link04Icon}
                            strokeWidth={2}
                            aria-label="Shared"
                            className="size-3 shrink-0 text-muted-foreground"
                          />
                        ) : null}
                      </button>
                    </Td>
                    {columns.map((c) => (
                      <ItemCell key={c} column={c} item={it} now={now} />
                    ))}
                  </ListRow>
                ))}
              </Fragment>
            ))}
          </tbody>
        </ListTable>
      </ContextMenuTrigger>
      <ContextMenuContent className="min-w-56">
        {selection.count ? (
          <CommandMenuItems as="context" ids={menuIds} />
        ) : (
          <CommandMenuItems as="context" ids={["select.all", "view.details"]} />
        )}
      </ContextMenuContent>
    </ContextMenu>
  );
}

function ItemCell({ column, item, now }: { column: ItemColumn; item: LibraryItem; now: number }) {
  switch (column) {
    case "location":
      return <Td title={item.location}>{item.location}</Td>;
    case "modified":
      return <Td>{fmtShortDate(item.updatedAt, now)}</Td>;
    case "kind":
      return <Td>{kindShortLabel(item.kind)}</Td>;
    case "size":
      return <Td align="right">{item.sizeBytes === null ? "—" : fmtBytes(item.sizeBytes)}</Td>;
    case "starred":
      return <Td>{item.starredAt ? fmtShortDate(item.starredAt, now) : "—"}</Td>;
    case "tags":
      return (
        <Td>
          <span className="flex items-center gap-1">
            {item.tags.slice(0, 3).map((t) => (
              <span
                key={t}
                className="inline-flex items-center gap-1 rounded-full border border-border px-1.5 text-[11px]"
              >
                <span className="size-1.5 rounded-full" style={{ background: tagColor(t) }} />
                {t}
              </span>
            ))}
            {item.tags.length > 3 ? (
              <span className="text-[11px]">+{item.tags.length - 3}</span>
            ) : null}
          </span>
        </Td>
      );
  }
}
