// Shared interaction layer for every explorer view: selection (click /
// ⌘-click / ⇧-click / keyboard / marquee), roving tabindex, open,
// inline rename, drag sources, drop targets and the context menus.
//
// PUBLIC CONTRACT (re-exported from ./index)
//   interface ExplorerViewProps {
//     items: ExplorerItem[];              – already sorted + filtered, display order
//     scope: string;                      – selection scope, e.g. "explorer:<id>", "recent"
//     readOnly?: boolean;                 – no drag, no rename, no drop targets
//     onOpen?: (item) => void;            – default: folder → /folders/:id, file → editor
//     menu?: ViewMenuConfig | false;      – context menus (false = none)
//     folderId?: string | null;           – folder the list shows: pane drop target and
//                                           background-menu context (undefined = not a folder)
//     folderName?: string;
//     empty?: ReactNode;                  – rendered when `items` is empty
//     className?: string;
//     ariaLabel?: string;
//   }
//   interface ViewMenuConfig {
//     item?: readonly string[];           – command ids (default ITEM_MENU_IDS)
//     background?: readonly string[] | null;   – default BACKGROUND_MENU_IDS; null hides it
//     moveTo?: boolean;                   – "Move to ▸" recent-destinations submenu (default true)
//   }

import {
  ArrowDown01Icon,
  ArrowUp01Icon,
  FolderTransferIcon,
  InformationCircleIcon,
  Share08Icon,
  SortingAZ02Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  type CSSProperties,
  createContext,
  type DragEvent as ReactDragEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useNavigate } from "react-router-dom";
import { setDetailsOpen } from "@/components/shell/shellStore";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { useFolders } from "@/data/folders";
import { useIsCut } from "@/features/actions/clipboard";
import { descendantFolderIds, folderPathLabel } from "@/features/actions/itemCache";
import { BACKGROUND_MENU_IDS, ITEM_MENU_IDS } from "@/features/actions/itemCommands";
import { useRecentDestinations } from "@/features/actions/recentDestinations";
import { itemActions } from "@/features/actions/useItemActions";
import type { ItemRef } from "@/lib/api/client";
import { CommandMenuItems } from "@/lib/commands/CommandMenuItems";
import { formatKeys } from "@/lib/commands/keymap";
import { getEffectiveKeys, registerCommands, runCommand } from "@/lib/commands/registry";
import { getExplorerPref, type SortKey, useExplorerPref } from "@/lib/explorerPrefs";
import { getSelection, parseRefKey } from "@/lib/selection";
import { cn } from "@/lib/utils";
import { startItemDrag, useIsDragSource, useItemDropTargets } from "../dnd/itemDnd";
import type { ExplorerItem } from "../model";
import { type NavKey, type NavLayout, navKeyFromEvent, nextIndex } from "../selection-logic";
import {
  dispatchSelection,
  getSelState,
  renameStore,
  startRename,
  stopRename,
  useIsItemFocused,
  useIsItemSelected,
  useRenaming,
} from "../state";
import { useMarquee } from "../useMarquee";

export interface ViewMenuConfig {
  item?: readonly string[];
  background?: readonly string[] | null;
  moveTo?: boolean;
}

export interface ExplorerViewProps {
  items: ExplorerItem[];
  scope: string;
  readOnly?: boolean;
  onOpen?: (item: ExplorerItem) => void;
  menu?: ViewMenuConfig | false;
  folderId?: string | null;
  folderName?: string;
  empty?: ReactNode;
  className?: string;
  ariaLabel?: string;
}

interface CollectionCtx {
  scope: string;
  readOnly: boolean;
  open: (item: ExplorerItem) => void;
  itemClick: (item: ExplorerItem) => void;
  order: () => string[];
  itemByKey: (key: string) => ExplorerItem | undefined;
  focusKey: (key: string) => void;
}

const Ctx = createContext<CollectionCtx | null>(null);

export function useCollection(): CollectionCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useCollection outside <Collection>");
  return c;
}

export function defaultOpen(navigate: (to: string) => void) {
  return (item: ExplorerItem) => {
    if (item.type === "folder") navigate(`/folders/${item.id}`);
    else itemActions.open(item.ref);
  };
}

function escapeKey(k: string) {
  return typeof CSS !== "undefined" && CSS.escape ? CSS.escape(k) : k.replace(/"/g, '\\"');
}

// ─── Collection container ───────────────────────────────────────────────

export interface CollectionProps extends ExplorerViewProps {
  /** Keyboard layout for arrow navigation (read lazily from the DOM). */
  layout: (container: HTMLElement) => NavLayout;
  /** Custom handler for nav keys; return true when handled. */
  onNavKey?: (key: NavKey, e: ReactKeyboardEvent<HTMLElement>) => boolean;
  marquee?: boolean;
  /** Called after a plain (unmodified) click selected an item. */
  onItemClick?: (item: ExplorerItem) => void;
  children: ReactNode;
  style?: CSSProperties;
  /** Extra class for the scroll container. */
  containerClassName?: string;
}

export function Collection(props: CollectionProps) {
  const {
    items,
    scope,
    readOnly = false,
    onOpen,
    menu,
    folderId,
    folderName,
    empty,
    layout,
    onNavKey,
    marquee = true,
    children,
    className,
    style,
    ariaLabel = "Items",
  } = props;
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement | null>(null);
  useItemDropTargets();

  const itemsRef = useRef(items);
  itemsRef.current = items;
  const byKey = useMemo(() => new Map(items.map((i) => [i.key, i])), [items]);
  const byKeyRef = useRef(byKey);
  byKeyRef.current = byKey;
  const openRef = useRef(onOpen ?? defaultOpen(navigate));
  openRef.current = onOpen ?? defaultOpen(navigate);
  const clickRef = useRef(props.onItemClick);
  clickRef.current = props.onItemClick;

  const focusKey = useCallback((key: string) => {
    const el = containerRef.current?.querySelector<HTMLElement>(`[data-key="${escapeKey(key)}"]`);
    if (!el) return;
    el.focus({ preventScroll: true });
    el.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, []);

  const ctx = useMemo<CollectionCtx>(
    () => ({
      scope,
      readOnly,
      open: (item) => openRef.current(item),
      itemClick: (item) => clickRef.current?.(item),
      order: () => itemsRef.current.map((i) => i.key),
      itemByKey: (k) => byKeyRef.current.get(k),
      focusKey,
    }),
    [scope, readOnly, focusKey],
  );

  // Drop selected keys that disappeared (moved, trashed, filtered out).
  useEffect(() => {
    if (getSelection().scope !== scope) return;
    console.warn("DBG prune", scope, items.length, items.map((i) => i.name).join(","));
    dispatchSelection(scope, { type: "prune", order: items.map((i) => i.key) });
  }, [items, scope]);

  // Page-level command overrides while mounted.
  useEffect(() => {
    const targetKey = () => {
      const s = getSelection();
      if (s.scope !== scope) return null;
      const r = s.items.length === 1 ? s.items[0] : s.items.length === 0 ? s.focused : null;
      return r ? `${r.type}:${r.id}` : null;
    };
    return registerCommands([
      {
        id: "select.all",
        label: "Select all",
        keys: ["mod+a"],
        group: "select",
        run: () => {
          dispatchSelection(scope, { type: "selectAll", order: ctx.order() });
        },
      },
      {
        id: "item.rename",
        label: "Rename",
        keys: ["f2"],
        group: "file",
        when: (c) => (c.selection.length > 0 || !!c.focused) && !c.route.startsWith("/trash"),
        disabledReason: (c) => (c.selection.length > 1 ? "Rename one item at a time" : null),
        run: () => {
          const k = targetKey();
          const item = k ? byKeyRef.current.get(k) : undefined;
          if (!item) {
            const s = getSelection();
            const r = s.items[0] ?? s.focused;
            if (r) itemActions.renameDialog(r);
            return;
          }
          if (readOnly) return;
          dispatchSelection(scope, { type: "set", keys: [item.key], focus: item.key });
          startRename(scope, item.key);
        },
      },
    ]);
  }, [scope, readOnly, ctx]);

  useEffect(() => () => stopRename(), []);

  const { onPointerDown: onMarqueeDown, rect } = useMarquee({
    containerRef,
    scope,
    enabled: marquee,
  });

  const onKeyDown = (e: ReactKeyboardEvent<HTMLElement>) => {
    const t = e.target as HTMLElement;
    if (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable) return;
    const nav = navKeyFromEvent(e.key);
    const order = ctx.order();
    if (nav) {
      if (e.altKey) return;
      if (onNavKey?.(nav, e)) {
        e.preventDefault();
        return;
      }
      const cur = getSelState(scope);
      const index = cur.focus ? order.indexOf(cur.focus) : -1;
      const el = containerRef.current;
      if (!el) return;
      const pageSize = Math.max(1, Math.floor(el.clientHeight / 36));
      const next = nextIndex(index, nav, layout(el), order.length, pageSize);
      if (next < 0) return;
      e.preventDefault();
      const key = order[next];
      dispatchSelection(scope, {
        type: "focus",
        key,
        shift: e.shiftKey,
        mod: e.metaKey || e.ctrlKey,
        order,
      });
      focusKey(key);
      return;
    }
    if (e.key === "Enter" && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey) {
      const cur = getSelState(scope);
      const k = cur.focus ?? (cur.selected.length === 1 ? cur.selected[0] : null);
      const item = k ? byKeyRef.current.get(k) : undefined;
      if (item) {
        e.preventDefault();
        e.stopPropagation();
        ctx.open(item);
      }
      return;
    }
    if ((e.key === "F10" && e.shiftKey) || e.key === "ContextMenu") {
      const cur = getSelState(scope);
      const el = cur.focus
        ? containerRef.current?.querySelector<HTMLElement>(`[data-key="${escapeKey(cur.focus)}"]`)
        : containerRef.current;
      if (!el) return;
      e.preventDefault();
      const r = el.getBoundingClientRect();
      el.dispatchEvent(
        new MouseEvent("contextmenu", {
          bubbles: true,
          cancelable: true,
          clientX: r.left + Math.min(24, r.width / 2),
          clientY: r.top + Math.min(24, r.height / 2),
        }),
      );
    }
  };

  const containerProps = {
    ref: containerRef,
    role: "listbox",
    "aria-multiselectable": true,
    "aria-label": ariaLabel,
    tabIndex: 0,
    "data-hotkeys": "allow",
    "data-explorer-pane": scope,
    ...(folderId !== undefined && !readOnly
      ? {
          "data-drop-folder": folderId ?? "root",
          "data-drop-name": folderName ?? (folderId === null ? "Home" : undefined),
        }
      : {}),
    onKeyDown,
    onPointerDown: onMarqueeDown,
    onFocus: (e: React.FocusEvent<HTMLDivElement>) => {
      if (e.target !== e.currentTarget) return;
      const cur = getSelState(scope);
      if (cur.focus) focusKey(cur.focus);
    },
    className: cn(
      "relative min-h-0 flex-1 overflow-auto outline-none select-none",
      "data-[file-drop-over=true]:bg-accent/20",
      className,
      props.containerClassName,
    ),
    style,
  } as const;

  const body = (
    <>
      {items.length === 0 && empty ? empty : children}
      {rect ? (
        <div
          aria-hidden
          className="pointer-events-none absolute z-20 rounded-[3px] border-[1.5px] border-dashed border-primary bg-primary/10"
          style={{ left: rect.left, top: rect.top, width: rect.width, height: rect.height }}
        />
      ) : null}
    </>
  );

  return (
    <Ctx.Provider value={ctx}>
      {menu === false ? (
        <div {...containerProps}>{body}</div>
      ) : (
        <CollectionMenu
          menu={menu ?? {}}
          folderId={folderId}
          readOnly={readOnly}
          containerProps={containerProps}
        >
          {body}
        </CollectionMenu>
      )}
    </Ctx.Provider>
  );
}

// ─── Per-item bindings ──────────────────────────────────────────────────

let renameTimer: ReturnType<typeof setTimeout> | null = null;
function cancelSlowRename() {
  if (renameTimer) clearTimeout(renameTimer);
  renameTimer = null;
}

export interface ItemState {
  selected: boolean;
  focused: boolean;
  cut: boolean;
  dragging: boolean;
  renaming: boolean;
}

/** Props + state for one rendered item. Spread `props` on the item's root. */
export function useItemBindings(item: ExplorerItem) {
  const c = useCollection();
  const { scope, readOnly } = c;
  const selected = useIsItemSelected(scope, item.key);
  const focused = useIsItemFocused(scope, item.key);
  const cut = useIsCut(item.ref);
  const dragging = useIsDragSource(item.key);
  const renaming = useRenaming(scope, item.key);
  const down = useRef<{ wasSole: boolean; deferred: boolean }>({ wasSole: false, deferred: false });

  const props = {
    role: "option",
    "aria-selected": selected,
    "data-item": "",
    "data-key": item.key,
    "data-type": item.type,
    "data-selected": selected || undefined,
    "data-focused": focused || undefined,
    tabIndex: focused ? 0 : -1,
    title: item.name,
    draggable: !readOnly && !renaming,
    ...(item.type === "folder" && !readOnly
      ? {
          "data-drop-folder": item.id,
          "data-drop-name": item.name,
          "data-spring-nav": item.id,
        }
      : {}),
    onPointerDown: (e: React.PointerEvent<HTMLElement>) => {
      if (e.button !== 0) return;
      const s = getSelState(scope);
      const mod = e.metaKey || e.ctrlKey;
      down.current = {
        wasSole: s.selected.length === 1 && s.selected[0] === item.key,
        deferred: false,
      };
      if (mod || e.shiftKey) return; // handled on click
      if (!selected) {
        dispatchSelection(scope, { type: "click", key: item.key, order: c.order() });
      } else {
        down.current.deferred = true;
      }
    },
    onClick: (e: ReactMouseEvent<HTMLElement>) => {
      if ((e.target as Element).closest("[data-inline-rename]")) return;
      const mod = e.metaKey || e.ctrlKey;
      if (mod || e.shiftKey) {
        cancelSlowRename();
        dispatchSelection(scope, {
          type: "click",
          key: item.key,
          mod,
          shift: e.shiftKey,
          order: c.order(),
        });
        return;
      }
      if (down.current.deferred) {
        dispatchSelection(scope, { type: "click", key: item.key, order: c.order() });
      }
      c.itemClick(item);
      if (e.detail === 1 && getExplorerPref("openWith") === "single") {
        c.open(item);
        return;
      }
      // Slow second click on the name of the sole selected item → rename.
      cancelSlowRename();
      if (
        !readOnly &&
        e.detail === 1 &&
        down.current.wasSole &&
        (e.target as Element).closest("[data-item-name]")
      ) {
        renameTimer = setTimeout(() => {
          renameTimer = null;
          const s = getSelState(scope);
          if (s.selected.length === 1 && s.selected[0] === item.key) startRename(scope, item.key);
        }, 550);
      }
    },
    onDoubleClick: (e: ReactMouseEvent<HTMLElement>) => {
      cancelSlowRename();
      if (e.metaKey || e.ctrlKey || e.shiftKey) return;
      if ((e.target as Element).closest("[data-inline-rename],[data-item-check]")) return;
      if (getExplorerPref("openWith") === "double") c.open(item);
    },
    onDragStart: (e: ReactDragEvent<HTMLElement>) => {
      cancelSlowRename();
      if (readOnly || renaming) {
        e.preventDefault();
        return;
      }
      const s = getSelState(scope);
      let keys = s.selected;
      if (!keys.includes(item.key)) {
        dispatchSelection(scope, { type: "click", key: item.key, order: c.order() });
        keys = [item.key];
      }
      const order = c.order();
      const sorted = [...keys].sort((a, b) => order.indexOf(a) - order.indexOf(b));
      const refs = sorted.map((k) => parseRefKey(k)).filter((r): r is ItemRef => !!r);
      const names = sorted.map((k) => c.itemByKey(k)?.name ?? "");
      startItemDrag(e, refs, { names, thumbUrl: item.thumbUrl });
    },
  };

  const toggle = () =>
    dispatchSelection(scope, { type: "click", key: item.key, mod: true, order: c.order() });

  const onRenameDone = (advance: 0 | 1 | -1) => {
    stopRename();
    if (advance === 0) {
      requestAnimationFrame(() => c.focusKey(item.key));
      return;
    }
    const order = c.order();
    const i = order.indexOf(item.key);
    const next = order[i + advance];
    if (next) {
      dispatchSelection(scope, { type: "set", keys: [next], focus: next });
      renameStore.set({ scope, key: next });
    }
  };

  const state: ItemState = { selected, focused, cut, dragging, renaming };
  return { props, state, toggle, onRenameDone };
}

/** Shared "selected / focused / cut / drag" classes for item roots. */
export function itemStateClass(s: ItemState): string {
  return cn(
    "outline-none",
    s.selected ? "bg-primary/15 border-primary/55" : "hover:bg-card",
    s.focused && "ring-2 ring-primary ring-offset-1 ring-offset-background",
    (s.cut || s.dragging) && "opacity-40",
    "data-[drop-over=true]:border-dashed data-[drop-over=true]:border-primary data-[drop-over=true]:bg-accent",
    "data-[file-drop-over=true]:border-dashed data-[file-drop-over=true]:border-primary data-[file-drop-over=true]:bg-accent",
    "data-[drop-invalid=true]:cursor-not-allowed data-[drop-invalid=true]:opacity-50",
  );
}

// ─── Context menus ──────────────────────────────────────────────────────

type MenuTarget = { kind: "item"; item: ExplorerItem } | { kind: "background" };

function CollectionMenu({
  menu,
  folderId,
  readOnly,
  containerProps,
  children,
}: {
  menu: ViewMenuConfig;
  folderId: string | null | undefined;
  readOnly: boolean;
  containerProps: Record<string, unknown>;
  children: ReactNode;
}) {
  const c = useCollection();
  const lastTarget = useRef<Element | null>(null);
  const [target, setTarget] = useState<MenuTarget | null>(null);
  const [open, setOpen] = useState(false);

  const resolve = () => {
    const el = lastTarget.current?.closest<HTMLElement>("[data-item]");
    const key = el?.dataset.key;
    const item = key ? c.itemByKey(key) : undefined;
    if (item) {
      const s = getSelState(c.scope);
      if (!s.selected.includes(item.key)) {
        dispatchSelection(c.scope, { type: "click", key: item.key, order: c.order() });
      }
      setTarget({ kind: "item", item });
    } else {
      dispatchSelection(c.scope, { type: "clear" });
      setTarget(menu.background === null ? null : { kind: "background" });
    }
  };

  const record = (e: { target: EventTarget }) => {
    lastTarget.current = e.target as Element;
  };

  return (
    <ContextMenu
      open={open}
      onOpenChange={(o) => {
        if (o) resolve();
        setOpen(o);
      }}
    >
      <ContextMenuTrigger
        render={
          <div
            {...(containerProps as object)}
            onContextMenuCapture={record}
            onTouchStartCapture={record}
          />
        }
      >
        {children}
      </ContextMenuTrigger>
      <ContextMenuContent className="min-w-60">
        {open && target?.kind === "item" ? (
          <ItemMenuBody menu={menu} item={target.item} readOnly={readOnly} />
        ) : open && target?.kind === "background" ? (
          <BackgroundMenuBody menu={menu} folderId={folderId} />
        ) : null}
      </ContextMenuContent>
    </ContextMenu>
  );
}

function splitAt(ids: readonly string[], token: string): [string[], string[]] | null {
  const i = ids.indexOf(token);
  if (i < 0) return null;
  return [ids.slice(0, i), ids.slice(i + 1)];
}

function ItemMenuBody({
  menu,
  item,
  readOnly,
}: {
  menu: ViewMenuConfig;
  item: ExplorerItem;
  readOnly: boolean;
}) {
  const ids = menu.item ?? ITEM_MENU_IDS;
  const count = getSelection().items.length;
  const folderExtras = item.type === "folder" && count <= 1 && !readOnly;
  const split = menu.moveTo === false || readOnly ? null : splitAt(ids, "item.move");
  const openIdx = ids.indexOf("-");
  const head = folderExtras && openIdx > 0 ? ids.slice(0, openIdx) : null;
  const render = (list: readonly string[]) => <CommandMenuItems ids={list} as="context" />;

  const extras = folderExtras ? (
    <>
      <ContextMenuSeparator />
      <CommandMenuItems
        ids={["file.newFile", "file.newFolder"]}
        as="context"
        ctx={{ currentFolderId: item.id }}
      />
    </>
  ) : null;

  if (!split) {
    if (!head) return render(ids);
    return (
      <>
        {render(head)}
        {extras}
        {render(ids.slice(openIdx))}
      </>
    );
  }
  const [before, after] = split;
  const beforeHead = head ? before.slice(0, openIdx) : before;
  const beforeRest = head ? before.slice(openIdx) : [];
  return (
    <>
      {render(beforeHead)}
      {extras}
      {beforeRest.length ? render(beforeRest) : null}
      <MoveToSubmenu />
      {render(after)}
    </>
  );
}

function MoveToSubmenu() {
  const recents = useRecentDestinations();
  const folders = useFolders();
  const sel = getSelection().items;
  const all = folders.data ?? [];
  const invalid = descendantFolderIds(
    all,
    sel.filter((r) => r.type === "folder").map((r) => r.id),
  );
  const byId = new Map(all.map((f) => [f.id, f]));
  const dests = recents.filter((id) => id === null || (byId.has(id) && !invalid.has(id)));
  const keys = formatKeys(getEffectiveKeys("item.move"));
  return (
    <ContextMenuSub>
      <ContextMenuSubTrigger>
        <HugeiconsIcon icon={FolderTransferIcon} strokeWidth={2} />
        <span>{sel.length > 1 ? `Move ${sel.length} items to` : "Move to"}</span>
      </ContextMenuSubTrigger>
      <ContextMenuSubContent className="min-w-56">
        {dests.length ? <ContextMenuLabel>Recent folders</ContextMenuLabel> : null}
        {dests.map((id) => (
          <ContextMenuItem
            key={id ?? "root"}
            onClick={() => void itemActions.move(getSelection().items, id)}
          >
            <span className="size-4" aria-hidden />
            <span className="truncate">
              {id === null ? "Home" : folderPathLabel(all, id).replace(/^Home \/ /, "")}
            </span>
          </ContextMenuItem>
        ))}
        {dests.length ? <ContextMenuSeparator /> : null}
        <ContextMenuItem onClick={() => runCommand("item.move")}>
          <HugeiconsIcon icon={FolderTransferIcon} strokeWidth={2} />
          <span>Choose folder…</span>
          {keys ? <ContextMenuShortcut className="pl-4">{keys}</ContextMenuShortcut> : null}
        </ContextMenuItem>
      </ContextMenuSubContent>
    </ContextMenuSub>
  );
}

const SORT_OPTIONS: Array<{ key: SortKey; label: string }> = [
  { key: "name", label: "Name" },
  { key: "modified", label: "Date modified" },
  { key: "created", label: "Date created" },
  { key: "size", label: "Size" },
  { key: "kind", label: "Kind" },
];

export function SortMenuItems({ as = "context" }: { as?: "context" }) {
  const [sort, setSort] = useExplorerPref("sort");
  const [foldersFirst, setFoldersFirst] = useExplorerPref("foldersFirst");
  void as;
  return (
    <>
      {SORT_OPTIONS.map((o) => (
        <ContextMenuItem
          key={o.key}
          onClick={() =>
            setSort(
              sort.key === o.key
                ? { key: o.key, dir: sort.dir === "asc" ? "desc" : "asc" }
                : { key: o.key, dir: o.key === "name" || o.key === "kind" ? "asc" : "desc" },
            )
          }
        >
          {sort.key === o.key ? (
            <HugeiconsIcon
              icon={sort.dir === "asc" ? ArrowUp01Icon : ArrowDown01Icon}
              strokeWidth={2}
            />
          ) : (
            <span className="size-4" aria-hidden />
          )}
          <span>{o.label}</span>
        </ContextMenuItem>
      ))}
      <ContextMenuSeparator />
      <ContextMenuItem onClick={() => setFoldersFirst(!foldersFirst)}>
        <span className="grid size-4 place-items-center text-xs" aria-hidden>
          {foldersFirst ? "✓" : ""}
        </span>
        <span>Folders first</span>
      </ContextMenuItem>
    </>
  );
}

function BackgroundMenuBody({
  menu,
  folderId,
}: {
  menu: ViewMenuConfig;
  folderId: string | null | undefined;
}) {
  const ids = menu.background ?? BACKGROUND_MENU_IDS;
  const split = splitAt(ids, "select.all");
  const folderRef: ItemRef | null = folderId ? { type: "folder", id: folderId } : null;
  const ctx = folderId !== undefined ? { currentFolderId: folderId } : undefined;
  return (
    <>
      <CommandMenuItems ids={split ? split[0] : ids} as="context" ctx={ctx} />
      {folderId !== undefined ? (
        <ContextMenuSub>
          <ContextMenuSubTrigger>
            <HugeiconsIcon icon={SortingAZ02Icon} strokeWidth={2} />
            <span>Sort by</span>
          </ContextMenuSubTrigger>
          <ContextMenuSubContent className="min-w-48">
            <SortMenuItems />
          </ContextMenuSubContent>
        </ContextMenuSub>
      ) : null}
      {split ? <CommandMenuItems ids={["select.all", ...split[1]]} as="context" ctx={ctx} /> : null}
      {folderRef ? (
        <>
          <ContextMenuSeparator />
          <ContextMenuItem onClick={() => itemActions.share(folderRef)}>
            <HugeiconsIcon icon={Share08Icon} strokeWidth={2} />
            <span>Share this folder…</span>
          </ContextMenuItem>
          <ContextMenuItem onClick={() => setDetailsOpen(true)}>
            <HugeiconsIcon icon={InformationCircleIcon} strokeWidth={2} />
            <span>Folder properties</span>
          </ContextMenuItem>
        </>
      ) : null}
    </>
  );
}
