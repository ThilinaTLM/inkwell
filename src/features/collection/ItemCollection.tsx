// ItemCollection — ONE component for a mixed list of folders + files.
//
// PUBLIC CONTRACT
//   <ItemCollection
//      items: CollectionItem[]        – build with toCollectionItems(folders, files)
//      layout?: "cards" | "list"      – default: device-local pref (useCollectionLayout)
//      filterChips?: boolean          – All · Boards · Notes · Diagrams · Sites · Files (only
//                                       kinds present are shown). default false
//      layoutToggle?: boolean         – show the Cards/List toggle in the toolbar row. default true
//      toolbarStart?/toolbarEnd?      – extra nodes in the toolbar row
//      showLocation?: boolean         – show the containing folder (flat / cross-folder lists)
//      empty?: ReactNode              – empty state (default: quiet "Nothing here yet")
//      loading?: boolean              – skeleton placeholders
//      sort?: boolean                 – default true: folders first, then updatedAt desc.
//                                       Pass false to keep the given order.
//      scope?: string                 – selection scope id (default "collection")
//      ariaLabel?: string
//      className?: string
//   />
//
// Behaviour
//   • single selection model: features/explorer/selection-logic (click, ⇧ range, arrows) mirrored
//     into the global selection store so registry commands (Enter, F2, Delete, S, ⇧S …) and the
//     context menu act on it.
//   • click selects · double-click opens · touch tap opens · ⌘/Ctrl-click and middle-click open in
//     a new tab · ⌘/Ctrl+A selects all · arrows/Home/End move focus.
//   • right-click menu: Open · Open in new tab · Share… · Star · Rename · Move to… · Duplicate ·
//     Download · Tags… · Move to Trash.
//   • drag items onto folders / sidebar projects / the Inbox row (features/explorer/dnd).

import {
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import { ContextMenu, ContextMenuContent, ContextMenuTrigger } from "@/components/ui/context-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { useFolders } from "@/data/folders";
import { folderPathLabel } from "@/features/actions/itemCache";
import { itemActions } from "@/features/actions/useItemActions";
import { startItemDrag, useItemDropTargets } from "@/features/explorer/dnd/itemDnd";
import {
  EMPTY_SEL,
  type NavLayout,
  navKeyFromEvent,
  nextIndex,
  selectionReducer,
} from "@/features/explorer/selection-logic";
import { CommandMenuItems } from "@/lib/commands/CommandMenuItems";
import { onCommandSignal } from "@/lib/commands/signals";
import { type CollectionLayout, useCollectionLayout } from "@/lib/explorerPrefs";
import { clearSelection, parseRefKey, setSelection, useSelection } from "@/lib/selection";
import { cn } from "@/lib/utils";
import { FileCard, FolderCard, type ItemHandlers, LIST_COLS, ListRow } from "./CollectionItems";
import { LayoutToggle } from "./LayoutToggle";
import { COLLECTION_MENU_IDS } from "./menus";
import {
  type CollectionItem,
  KIND_FILTERS,
  type KindFilter,
  matchesKindFilter,
  sortCollectionItems,
} from "./model";

export interface ItemCollectionProps {
  items: CollectionItem[];
  layout?: CollectionLayout;
  filterChips?: boolean;
  layoutToggle?: boolean;
  toolbarStart?: ReactNode;
  toolbarEnd?: ReactNode;
  showLocation?: boolean;
  empty?: ReactNode;
  loading?: boolean;
  sort?: boolean;
  scope?: string;
  ariaLabel?: string;
  className?: string;
}

const FOLDER_GRID = "grid grid-cols-[repeat(auto-fill,minmax(230px,1fr))] gap-3";
const FILE_GRID = "grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-4";

function colCount(el: HTMLElement | null): number {
  if (!el) return 1;
  const cols = getComputedStyle(el).gridTemplateColumns.split(" ").filter(Boolean).length;
  return Math.max(1, cols);
}

export function ItemCollection({
  items,
  layout: layoutProp,
  filterChips = false,
  layoutToggle = true,
  toolbarStart,
  toolbarEnd,
  showLocation = false,
  empty,
  loading = false,
  sort = true,
  scope = "collection",
  ariaLabel = "Items",
  className,
}: ItemCollectionProps) {
  const [prefLayout] = useCollectionLayout();
  const layout = layoutProp ?? prefLayout;
  const [kind, setKind] = useState<KindFilter>("all");
  const folders = useFolders();
  useItemDropTargets();

  const sorted = useMemo(() => (sort ? sortCollectionItems(items) : items), [items, sort]);
  const present = useMemo(() => {
    const set = new Set<string>();
    for (const i of items) if (i.type === "file") set.add(i.kind);
    return set;
  }, [items]);
  const activeKind = kind === "all" || present.has(kind) ? kind : "all";
  const visible = useMemo(
    () => sorted.filter((i) => matchesKindFilter(i, activeKind)),
    [sorted, activeKind],
  );
  const folderItems = useMemo(() => visible.filter((i) => i.type === "folder"), [visible]);
  const fileItems = useMemo(() => visible.filter((i) => i.type === "file"), [visible]);
  // Display order (cards: folders section then files; list: as sorted).
  const ordered = useMemo(() => [...folderItems, ...fileItems], [folderItems, fileItems]);
  const order = useMemo(() => ordered.map((i) => i.key), [ordered]);
  const byKey = useMemo(() => new Map(ordered.map((i) => [i.key, i])), [ordered]);

  const locationOf = useCallback(
    (item: CollectionItem): string | undefined => {
      if (!showLocation || !folders.data) return undefined;
      return folderPathLabel(folders.data, item.parentId);
    },
    [showLocation, folders.data],
  );

  // ── Selection ──────────────────────────────────────────────────────
  const [sel, dispatch] = useReducer(selectionReducer, EMPTY_SEL);
  const selRef = useRef(sel);
  selRef.current = sel;
  const orderRef = useRef(order);
  orderRef.current = order;
  const global = useSelection();

  useEffect(() => {
    dispatch({ type: "prune", order });
  }, [order]);

  // Mirror to the global store (commands, menus read it).
  useEffect(() => {
    const refs = sel.selected.flatMap((k) => parseRefKey(k) ?? []);
    setSelection({ scope, items: refs, focused: sel.focus ? parseRefKey(sel.focus) : null });
  }, [sel, scope]);
  useEffect(() => () => clearSelection(scope), [scope]);
  // Something else cleared the global selection (Esc, route change).
  useEffect(() => {
    if (global.scope === scope && global.items.length === 0 && selRef.current.selected.length) {
      dispatch({ type: "clear" });
    }
  }, [global, scope]);
  useEffect(
    () =>
      onCommandSignal("select.all", () => {
        if (orderRef.current.length) dispatch({ type: "selectAll", order: orderRef.current });
      }),
    [],
  );

  // ── Pointer / drag handlers ────────────────────────────────────────
  const pointerType = useRef<string>("mouse");
  const handlers = useMemo<ItemHandlers>(
    () => ({
      onItemPointerDown: (e: ReactPointerEvent) => {
        pointerType.current = e.pointerType;
      },
      onItemClick: (item, e: ReactMouseEvent) => {
        if (pointerType.current === "touch") {
          itemActions.open(item.ref);
          return;
        }
        if (e.metaKey || e.ctrlKey) {
          itemActions.open(item.ref, { newTab: true });
          return;
        }
        dispatch({ type: "click", key: item.key, shift: e.shiftKey, order: orderRef.current });
      },
      onItemDoubleClick: (item) => {
        if (pointerType.current !== "touch") itemActions.open(item.ref);
      },
      onItemAuxClick: (item, e) => {
        if (e.button !== 1) return;
        e.preventDefault();
        itemActions.open(item.ref, { newTab: true });
      },
      onItemDragStart: (item, e) => {
        const cur = selRef.current;
        let keys = cur.selected;
        if (!keys.includes(item.key)) {
          keys = [item.key];
          dispatch({ type: "click", key: item.key, order: orderRef.current });
        }
        const refs = keys.flatMap((k) => parseRefKey(k) ?? []);
        startItemDrag(e, refs, { thumbUrl: item.thumbUrl });
      },
    }),
    [],
  );

  // ── Keyboard ───────────────────────────────────────────────────────
  const foldersGrid = useRef<HTMLDivElement>(null);
  const filesGrid = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const onKeyDown = (e: ReactKeyboardEvent) => {
    if (e.defaultPrevented) return;
    const nav = navKeyFromEvent(e.key);
    if (!nav || e.altKey) return;
    if ((e.target as HTMLElement).closest("input, textarea, [role=menu]")) return;
    const count = order.length;
    if (!count) return;
    const layoutDesc: NavLayout =
      layout === "list"
        ? { type: "list" }
        : {
            type: "grid",
            sections: [
              { start: 0, count: folderItems.length, cols: colCount(foldersGrid.current) },
              {
                start: folderItems.length,
                count: fileItems.length,
                cols: colCount(filesGrid.current),
              },
            ],
          };
    const cur = sel.focus ? order.indexOf(sel.focus) : -1;
    const idx = nextIndex(cur, nav, layoutDesc, count);
    const key = order[idx];
    if (!key) return;
    e.preventDefault();
    dispatch({ type: "focus", key, shift: e.shiftKey, mod: e.metaKey || e.ctrlKey, order });
    requestAnimationFrame(() => {
      const el = rootRef.current?.querySelector<HTMLElement>(
        `[data-item-key="${CSS.escape(key)}"]`,
      );
      el?.focus({ preventScroll: true });
      el?.scrollIntoView({ block: "nearest" });
    });
  };

  // Right-click: select the target first (unless already selected). Empty
  // space keeps the native menu.
  const onContextMenuCapture = (e: ReactMouseEvent) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>("[data-item-key]");
    const key = el?.dataset.itemKey;
    if (!key || !byKey.has(key)) {
      e.stopPropagation();
      return;
    }
    if (!selRef.current.selected.includes(key)) {
      dispatch({ type: "click", key, order: orderRef.current });
      const ref = parseRefKey(key);
      if (ref) setSelection({ scope, items: [ref], focused: ref });
    }
  };

  const onBackgroundClick = (e: ReactMouseEvent) => {
    if ((e.target as HTMLElement).closest("[data-item-key]")) return;
    dispatch({ type: "clear" });
  };

  const tabbableKey = sel.focus && byKey.has(sel.focus) ? sel.focus : (order[0] ?? null);
  const selected = useMemo(() => new Set(sel.selected), [sel.selected]);

  const renderFolder = (i: CollectionItem) => (
    <FolderCard
      key={i.key}
      item={i}
      selected={selected.has(i.key)}
      tabbable={i.key === tabbableKey}
      handlers={handlers}
      location={locationOf(i)}
    />
  );

  const showToolbar =
    filterChips || layoutToggle || toolbarStart !== undefined || toolbarEnd !== undefined;

  return (
    <div className={cn("flex min-w-0 flex-col", className)}>
      {showToolbar ? (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          {toolbarStart}
          {filterChips && present.size > 0 ? (
            <div role="toolbar" aria-label="Filter by type" className="flex flex-wrap gap-1.5">
              {KIND_FILTERS.filter((f) => f.id === "all" || present.has(f.id)).map((f) => (
                <button
                  key={f.id}
                  type="button"
                  aria-pressed={activeKind === f.id}
                  onClick={() => setKind(f.id)}
                  className={cn(
                    "h-7 rounded-full border px-3 text-xs font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/40",
                    activeKind === f.id
                      ? "border-foreground bg-foreground text-background"
                      : "border-border bg-card text-muted-foreground hover:border-input hover:text-foreground",
                  )}
                >
                  {f.label}
                </button>
              ))}
            </div>
          ) : null}
          <div className="ml-auto flex items-center gap-2">
            {toolbarEnd}
            {layoutToggle ? <LayoutToggle /> : null}
          </div>
        </div>
      ) : null}

      {loading ? (
        <CollectionSkeleton layout={layout} />
      ) : ordered.length === 0 ? (
        <div className="py-10">
          {empty ?? <p className="text-center text-sm text-muted-foreground">Nothing here yet.</p>}
        </div>
      ) : (
        <ContextMenu>
          <ContextMenuTrigger
            render={
              <div
                ref={rootRef}
                role="listbox"
                aria-multiselectable="true"
                aria-label={ariaLabel}
                onKeyDown={onKeyDown}
                onClick={onBackgroundClick}
                onContextMenuCapture={onContextMenuCapture}
                className="min-h-24 outline-none"
              />
            }
          >
            {layout === "list" ? (
              <div className="overflow-hidden rounded-xl border border-border bg-card shadow-card">
                <div
                  aria-hidden
                  className={cn(
                    "hidden items-center gap-3 border-b border-border bg-surface-2 px-3 py-2 text-[11px] font-semibold tracking-wide text-faint uppercase md:grid",
                    showLocation ? LIST_COLS.withLocation : LIST_COLS.plain,
                  )}
                >
                  <span>Name</span>
                  <span>Kind</span>
                  {showLocation ? <span>Location</span> : null}
                  <span>Modified</span>
                  <span>Size</span>
                </div>
                {ordered.map((i) => (
                  <ListRow
                    key={i.key}
                    item={i}
                    selected={selected.has(i.key)}
                    tabbable={i.key === tabbableKey}
                    handlers={handlers}
                    location={locationOf(i)}
                    withLocation={showLocation}
                  />
                ))}
              </div>
            ) : (
              <div className="flex flex-col gap-6">
                {folderItems.length ? (
                  <div ref={foldersGrid} className={FOLDER_GRID}>
                    {folderItems.map(renderFolder)}
                  </div>
                ) : null}
                {fileItems.length ? (
                  <div ref={filesGrid} className={FILE_GRID}>
                    {fileItems.map((i) => (
                      <FileCard
                        key={i.key}
                        item={i}
                        selected={selected.has(i.key)}
                        tabbable={i.key === tabbableKey}
                        handlers={handlers}
                        location={locationOf(i)}
                      />
                    ))}
                  </div>
                ) : null}
              </div>
            )}
          </ContextMenuTrigger>
          <ContextMenuContent className="w-56">
            <CommandMenuItems ids={COLLECTION_MENU_IDS} as="context" />
          </ContextMenuContent>
        </ContextMenu>
      )}
    </div>
  );
}

function CollectionSkeleton({ layout }: { layout: CollectionLayout }) {
  if (layout === "list") {
    return (
      <div aria-hidden className="overflow-hidden rounded-xl border border-border bg-card">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="flex h-12 items-center gap-3 border-b border-border px-3">
            <Skeleton className="size-6" />
            <Skeleton className="h-3.5 w-48" />
          </div>
        ))}
      </div>
    );
  }
  return (
    <div aria-hidden className={FILE_GRID}>
      {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
        <div key={i} className="overflow-hidden rounded-xl border border-border bg-card">
          <Skeleton className="aspect-[16/10] rounded-none" />
          <div className="space-y-2 p-3">
            <Skeleton className="h-3.5 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        </div>
      ))}
    </div>
  );
}
