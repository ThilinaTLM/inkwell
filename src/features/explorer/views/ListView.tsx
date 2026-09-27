// Details (list) view — screen 03. Sortable headers (⇧-click adds a
// secondary sort), header right-click column chooser, resizable widths
// (persisted to the `listColumns` / `listColumnWidths` prefs) and
// row checkboxes. Rows are CSS-grid divs so the listbox a11y model and
// the shared item bindings apply unchanged.

import {
  ArrowDown01Icon,
  ArrowUp01Icon,
  Link04Icon,
  MoreHorizontalIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { memo, type ReactNode, useMemo, useRef, useState } from "react";
import {
  ContextMenu,
  ContextMenuCheckboxItem,
  ContextMenuContent,
  ContextMenuLabel,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { useFolders } from "@/data/folders";
import { folderPathLabel } from "@/features/actions/itemCache";
import { type ListColumn, useExplorerPref } from "@/lib/explorerPrefs";
import { fmtDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { type ExplorerItem, formatBytes, type ItemSort, kindLabel } from "../model";
import { dispatchSelection, useSelectedKeys } from "../state";
import {
  Collection,
  type ExplorerViewProps,
  itemStateClass,
  useCollection,
  useItemBindings,
} from "./collection";
import { ItemName, SelectCheck } from "./ItemName";
import { ItemIcon, StarMark, TagPill } from "./ItemVisuals";

export interface ListColumnDef {
  id: string;
  label: string;
  /** Default width in px (name column: minimum width). */
  width?: number;
  align?: "left" | "right";
  render: (item: ExplorerItem) => ReactNode;
  /** Sort key passed to `onSortChange` (defaults to `id`); `false` = not sortable. */
  sortKey?: string | false;
}

export interface ListViewProps extends ExplorerViewProps {
  /** Visible built-in columns (default: the `listColumns` pref). */
  columns?: ListColumn[];
  /** Page-specific columns (e.g. Location, Deleted, Purges in), shown after Name. */
  extraColumns?: ListColumnDef[];
  sort?: readonly ItemSort[];
  onSortChange?: (sort: ItemSort[]) => void;
  /** Persist chooser + widths to prefs (default true). */
  persistColumns?: boolean;
}

const MIN_W = 60;

function LocationCell({ item }: { item: ExplorerItem }) {
  const folders = useFolders();
  if (typeof item.extra?.originalPath === "string") return <>{item.extra.originalPath}</>;
  return <>{folders.data ? folderPathLabel(folders.data, item.parentId) : "—"}</>;
}

const BUILTIN: Record<ListColumn, ListColumnDef> = {
  name: { id: "name", label: "Name", width: 260, render: () => null },
  kind: {
    id: "kind",
    label: "Kind",
    width: 120,
    render: (i) => (i.type === "folder" ? `Folder · ${i.itemCount ?? 0}` : kindLabel(i.kind)),
  },
  modified: {
    id: "modified",
    label: "Modified",
    width: 150,
    render: (i) => fmtDateTime(i.updatedAt),
  },
  created: { id: "created", label: "Created", width: 150, render: (i) => fmtDateTime(i.createdAt) },
  size: {
    id: "size",
    label: "Size",
    width: 90,
    align: "right",
    render: (i) => (i.type === "folder" ? "—" : formatBytes(i.sizeBytes ?? 0)),
  },
  tags: {
    id: "tags",
    label: "Tags",
    width: 180,
    sortKey: "tags",
    render: (i) => (
      <span className="flex min-w-0 gap-1 overflow-hidden">
        {i.tags.map((t) => (
          <TagPill key={t} tag={t} />
        ))}
      </span>
    ),
  },
  location: {
    id: "location",
    label: "Location",
    width: 200,
    sortKey: false,
    render: (i) => <LocationCell item={i} />,
  },
  shared: {
    id: "shared",
    label: "Sharing",
    width: 100,
    render: (i) =>
      i.shareCount > 0 ? (
        <span className="inline-flex items-center gap-1 text-accent-foreground">
          <HugeiconsIcon icon={Link04Icon} strokeWidth={2} className="size-3" />
          {i.shareCount} link{i.shareCount === 1 ? "" : "s"}
        </span>
      ) : (
        <span className="text-muted-foreground/60">—</span>
      ),
  },
};

const CHOOSABLE: ListColumn[] = [
  "kind",
  "tags",
  "modified",
  "created",
  "size",
  "shared",
  "location",
];

export function ListView({
  columns,
  extraColumns = [],
  sort,
  onSortChange,
  persistColumns = true,
  ...props
}: ListViewProps) {
  const [prefCols, setPrefCols] = useExplorerPref("listColumns");
  const [prefWidths, setPrefWidths] = useExplorerPref("listColumnWidths");
  const [localCols, setLocalCols] = useState<ListColumn[] | null>(null);
  const [localWidths, setLocalWidths] = useState<Record<string, number>>({});
  const [live, setLive] = useState<{ id: string; w: number } | null>(null);

  const visible = columns ?? (persistColumns ? prefCols : (localCols ?? prefCols));
  const widths: Record<string, number> = { ...(persistColumns ? prefWidths : {}), ...localWidths };

  const defs = useMemo(() => {
    const builtins = visible.filter((c) => c !== "name" && BUILTIN[c]).map((c) => BUILTIN[c]);
    return [BUILTIN.name, ...extraColumns, ...builtins];
  }, [visible, extraColumns]);

  const widthOf = (d: ListColumnDef) =>
    live?.id === d.id ? live.w : (widths[d.id] ?? d.width ?? 120);
  const template = [
    "32px",
    ...defs.map((d) => (d.id === "name" ? `minmax(${widthOf(d)}px, 1fr)` : `${widthOf(d)}px`)),
    "32px",
  ].join(" ");

  const setVisible = (next: ListColumn[]) => {
    const withName: ListColumn[] = ["name", ...next.filter((c) => c !== "name")];
    if (persistColumns && !columns) setPrefCols(withName);
    else setLocalCols(withName);
  };
  const commitWidth = (id: string, w: number) => {
    setLive(null);
    if (persistColumns && id in BUILTIN) setPrefWidths({ ...prefWidths, [id]: w });
    else setLocalWidths((s) => ({ ...s, [id]: w }));
  };

  const onHeaderClick = (d: ListColumnDef, shift: boolean) => {
    if (!onSortChange || d.sortKey === false) return;
    const key = d.sortKey ?? d.id;
    const cur = [...(sort ?? [])];
    const defDir: ItemSort["dir"] =
      key === "name" || key === "kind" || key === "tags" ? "asc" : "desc";
    if (!shift) {
      const primary = cur[0];
      onSortChange([
        primary?.key === key
          ? { key, dir: primary.dir === "asc" ? "desc" : "asc" }
          : { key, dir: defDir },
      ]);
      return;
    }
    const i = cur.findIndex((s) => s.key === key);
    if (i === 0)
      return onSortChange([{ key, dir: cur[0].dir === "asc" ? "desc" : "asc" }, ...cur.slice(1)]);
    if (i > 0) {
      cur[i] = { key, dir: cur[i].dir === "asc" ? "desc" : "asc" };
      return onSortChange(cur);
    }
    onSortChange([...cur, { key, dir: defDir }].slice(0, 3));
  };

  return (
    <Collection {...props} layout={() => ({ type: "list" })} containerClassName="pb-3">
      <div
        role="presentation"
        className="min-w-max"
        style={{ ["--list-template" as string]: template }}
      >
        <ContextMenu>
          <ContextMenuTrigger
            render={
              <div
                data-no-marquee=""
                className="sticky top-0 z-10 grid h-8 items-center border-b border-border bg-background text-[11.5px] font-semibold text-muted-foreground"
                style={{ gridTemplateColumns: "var(--list-template)" }}
              />
            }
          >
            <HeaderCheck />
            {defs.map((d) => {
              const si = (sort ?? []).findIndex((s) => s.key === (d.sortKey ?? d.id));
              const s = si >= 0 ? sort?.[si] : undefined;
              return (
                <div
                  key={d.id}
                  className={cn(
                    "relative flex h-full min-w-0 items-center gap-1 px-2.5",
                    d.align === "right" && "justify-end",
                    s && "text-foreground",
                  )}
                >
                  <button
                    type="button"
                    tabIndex={-1}
                    disabled={!onSortChange || d.sortKey === false}
                    onClick={(e) => onHeaderClick(d, e.shiftKey)}
                    className="flex min-w-0 items-center gap-1 truncate enabled:hover:text-foreground"
                    title={
                      onSortChange
                        ? "Sort (⇧-click: secondary sort) · right-click: columns"
                        : undefined
                    }
                  >
                    <span className="truncate">{d.label}</span>
                    {s ? (
                      <HugeiconsIcon
                        icon={s.dir === "asc" ? ArrowUp01Icon : ArrowDown01Icon}
                        strokeWidth={2}
                        className="size-3 shrink-0"
                      />
                    ) : null}
                    {s && (sort?.length ?? 0) > 1 ? (
                      <span className="text-[10px] text-muted-foreground">{si + 1}</span>
                    ) : null}
                  </button>
                  <ResizeHandle
                    width={widthOf(d)}
                    onLive={(w) => setLive({ id: d.id, w })}
                    onCommit={(w) => commitWidth(d.id, w)}
                  />
                </div>
              );
            })}
            <div />
          </ContextMenuTrigger>
          <ContextMenuContent className="min-w-48">
            <ContextMenuLabel>Columns</ContextMenuLabel>
            <ContextMenuCheckboxItem checked disabled>
              Name
            </ContextMenuCheckboxItem>
            {CHOOSABLE.map((c) => (
              <ContextMenuCheckboxItem
                key={c}
                checked={visible.includes(c)}
                disabled={!!columns}
                onCheckedChange={(on) =>
                  setVisible(on ? [...visible, c] : visible.filter((x) => x !== c))
                }
              >
                {BUILTIN[c].label}
              </ContextMenuCheckboxItem>
            ))}
          </ContextMenuContent>
        </ContextMenu>
        {props.items.map((item) => (
          <ListRow key={item.key} item={item} defs={defs} />
        ))}
      </div>
    </Collection>
  );
}

function HeaderCheck() {
  const c = useCollection();
  const all = c.order();
  const n = useSelectedKeys(c.scope).length;
  return (
    <div className="flex items-center justify-center">
      <SelectCheck
        checked={all.length > 0 && n === all.length}
        onToggle={() =>
          n === all.length
            ? dispatchSelection(c.scope, { type: "clear" })
            : dispatchSelection(c.scope, { type: "selectAll", order: all })
        }
      />
    </div>
  );
}

function ResizeHandle({
  width,
  onLive,
  onCommit,
}: {
  width: number;
  onLive: (w: number) => void;
  onCommit: (w: number) => void;
}) {
  const start = useRef<{ x: number; w: number } | null>(null);
  return (
    <div
      aria-hidden
      onPointerDown={(e) => {
        e.stopPropagation();
        e.preventDefault();
        start.current = { x: e.clientX, w: width };
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        if (!start.current) return;
        onLive(Math.max(MIN_W, Math.round(start.current.w + e.clientX - start.current.x)));
      }}
      onPointerUp={(e) => {
        if (!start.current) return;
        const w = Math.max(MIN_W, Math.round(start.current.w + e.clientX - start.current.x));
        start.current = null;
        onCommit(w);
      }}
      className="absolute top-1 right-0 bottom-1 w-1.5 cursor-col-resize border-r border-border/60 hover:border-primary"
    />
  );
}

const ListRow = memo(function ListRow({
  item,
  defs,
}: {
  item: ExplorerItem;
  defs: ListColumnDef[];
}) {
  const { props, state, toggle, onRenameDone } = useItemBindings(item);
  return (
    <div
      {...props}
      className={cn(
        "group grid h-9 cursor-default items-center border-b border-border/40 text-[12.5px] text-muted-foreground",
        "border-x-0 border-t-0",
        itemStateClass({ ...state, focused: false }),
        state.focused && "shadow-[inset_2px_0_0_var(--color-primary)]",
      )}
      style={{ gridTemplateColumns: "var(--list-template)" }}
    >
      <div className="flex items-center justify-center">
        <SelectCheck checked={state.selected} onToggle={toggle} />
      </div>
      {defs.map((d) =>
        d.id === "name" ? (
          <div
            key="name"
            className="flex min-w-0 items-center gap-2 px-2.5 font-semibold text-foreground"
          >
            <ItemIcon kind={item.kind} />
            <ItemName item={item} state={state} onRenameDone={onRenameDone} />
            {item.starred ? <StarMark /> : null}
          </div>
        ) : (
          <div
            key={d.id}
            className={cn(
              "min-w-0 truncate px-2.5 whitespace-nowrap",
              d.align === "right" && "text-right",
            )}
          >
            {d.render(item)}
          </div>
        ),
      )}
      <button
        type="button"
        tabIndex={-1}
        aria-label="More actions"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
          e.currentTarget.dispatchEvent(
            new MouseEvent("contextmenu", {
              bubbles: true,
              cancelable: true,
              clientX: r.left,
              clientY: r.bottom,
            }),
          );
        }}
        className="grid size-7 place-items-center rounded text-muted-foreground/70 opacity-0 group-hover:opacity-100 hover:bg-muted hover:text-foreground focus-visible:opacity-100"
      >
        <HugeiconsIcon icon={MoreHorizontalIcon} strokeWidth={2} className="size-3.5" />
      </button>
    </div>
  );
});
