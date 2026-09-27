// Explorer page (`/` and `/folders/:folderId`) — replaces the old
// DashboardPage + BrowseView.
//
//   toolbar (nav, breadcrumb, filter, New folder, Upload ▾, sort, views, details)
//   filter bar (kinds, tag, sort label, thumbnail slider)
//   pane: Grid / Compact / List / Columns (per-folder view memory)
//   status bar (counts, selection size)
//   + bulk bar, details panel, quick look, OS-file drop overlay
//
// `?select=file:<id>[,folder:<id>…]` selects + reveals items once the
// listing has loaded (editor back button, palette "reveal").
//
// Below 768px (wireframe screen 23): List is the default view unless the
// folder has its own remembered view (Columns falls back to List), a tap
// opens, a long-press enters selection mode (further taps toggle; the
// bulk bar docks at the bottom), and a FAB offers New / Upload. The
// desktop code paths are unchanged.

import { Add01Icon, FileAddIcon, FolderAddIcon, Upload01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type TouchEvent as ReactTouchEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { SkeletonGrid } from "@/components/SkeletonGrid";
import { PageFrame, StatusBar } from "@/components/shell/page";
import { useShellState } from "@/components/shell/shellStore";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useFiles } from "@/data/files";
import { useFolders } from "@/data/folders";
import { useItemActions } from "@/features/actions/useItemActions";
import { folderPath } from "@/features/folders/FolderTree";
import { DropOverlay, dragHasFiles, openUploadPicker } from "@/features/upload";
import type { FileKind } from "@/lib/api/client";
import { hasFolderView, type SortKey, useExplorerPref, useFolderView } from "@/lib/explorerPrefs";
import { parseRefKey } from "@/lib/selection";
import { BulkBar } from "./BulkBar";
import { EmptyFolder } from "./EmptyFolder";
import { ExplorerDetails } from "./ExplorerDetails";
import { ExplorerFilterBar } from "./ExplorerFilterBar";
import { ExplorerToolbar, SORT_LABELS } from "./ExplorerToolbar";
import {
  type ExplorerItem,
  filterItems,
  formatBytes,
  type ItemKind,
  type ItemSort,
  sortItems,
  summarize,
  toExplorerItems,
} from "./model";
import { QuickLook } from "./QuickLook";
import { dispatchSelection, takePendingSelection, useSelectedKeys } from "./state";
import { ColumnsView } from "./views/ColumnsView";
import { CompactView } from "./views/CompactView";
import { defaultOpen } from "./views/collection";
import { GridView } from "./views/GridView";
import { ListView } from "./views/ListView";

const SORT_KEYS: SortKey[] = ["name", "modified", "created", "size", "kind"];
const isSortKey = (k: string): k is SortKey => (SORT_KEYS as string[]).includes(k);

export function ExplorerPage() {
  const navigate = useNavigate();
  const params = useParams<{ folderId: string }>();
  const folderId = params.folderId ?? null;
  const [search, setSearch] = useSearchParams();
  useItemActions(); // binds the actions runtime for this subtree

  // Legacy `/?folder=<id>` bookmarks.
  useEffect(() => {
    const legacy = search.get("folder");
    if (legacy && !folderId) navigate(`/folders/${legacy}`, { replace: true });
  }, [search, folderId, navigate]);

  const scope = `explorer:${folderId ?? "root"}`;
  const foldersQ = useFolders();
  const filesQ = useFiles({ folderId: folderId ?? "root" });
  const [storedView, setView] = useFolderView(folderId);
  const isMobile = useShellState((st) => st.isMobile);
  // Phones: List unless this folder has its own remembered view; the
  // Columns view needs width, so it falls back to List too.
  const view =
    isMobile && (storedView === "columns" || !hasFolderView(folderId)) ? "list" : storedView;
  const [prefSort, setPrefSort] = useExplorerPref("sort");
  const [foldersFirst] = useExplorerPref("foldersFirst");
  const [localSorts, setLocalSorts] = useState<ItemSort[] | null>(null);
  const [text, setText] = useState("");
  const [kinds, setKinds] = useState<FileKind[]>([]);
  const [tag, setTag] = useState<string | null>(null);

  // A new folder starts unfiltered.
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset on folder change only
  useEffect(() => setText(""), [folderId]);
  // Menu / toolbar sort changes win over a list-header multi-sort.
  useEffect(() => {
    setLocalSorts((cur) =>
      cur &&
      (cur[0]?.key !== prefSort.key || cur[0]?.dir !== prefSort.dir) &&
      isSortKey(cur[0]?.key ?? "")
        ? null
        : cur,
    );
  }, [prefSort]);

  const allFolders = foldersQ.data ?? null;
  const folder =
    folderId && allFolders ? (allFolders.find((f) => f.id === folderId) ?? null) : null;
  const path = useMemo(
    () => (folderId && allFolders ? folderPath(allFolders, folderId) : []),
    [allFolders, folderId],
  );
  const folderName = folderId ? (folder?.name ?? "Folder") : "Home";

  const sorts: ItemSort[] = useMemo(() => localSorts ?? [prefSort], [localSorts, prefSort]);
  const prepare = useCallback(
    (items: ExplorerItem[]) => {
      const kindSet: ItemKind[] | undefined = kinds.length ? ["folder", ...kinds] : undefined;
      return sortItems(filterItems(items, { text, kinds: kindSet, tag }), sorts, { foldersFirst });
    },
    [text, kinds, tag, sorts, foldersFirst],
  );

  const rawItems = useMemo(() => {
    if (!allFolders || !filesQ.data) return null;
    return toExplorerItems(
      allFolders.filter((f) => (f.parentId ?? null) === folderId),
      filesQ.data,
    );
  }, [allFolders, filesQ.data, folderId]);
  const items = useMemo(() => (rawItems ? prepare(rawItems) : []), [rawItems, prepare]);
  const loading = rawItems === null;

  // ─── ?select= and pending selections (after navigation) ───────────────
  const focusSoon = (key: string) =>
    requestAnimationFrame(() => {
      const el = document.querySelector<HTMLElement>(
        `[data-explorer-pane="${scope}"] [data-key="${CSS.escape(key)}"]`,
      );
      el?.focus({ preventScroll: true });
      el?.scrollIntoView({ block: "center", inline: "nearest" });
    });
  const selectParam = search.get("select");
  // biome-ignore lint/correctness/useExhaustiveDependencies: run when the listing or target changes
  useEffect(() => {
    if (loading) return; // wait for the listing
    const pending = takePendingSelection();
    const keys =
      pending ??
      (selectParam ? selectParam.split(",").filter((k) => parseRefKey(k) !== null) : null);
    if (!keys?.length) return;
    dispatchSelection(scope, { type: "set", keys, focus: keys[0] });
    focusSoon(keys[0]);
    if (selectParam) {
      const next = new URLSearchParams(search);
      next.delete("select");
      setSearch(next, { replace: true });
    }
  }, [scope, loading, selectParam]);

  // ─── OS file drop overlay (hovering the pane background) ──────────────
  const [overlay, setOverlay] = useState<string | null>(null);
  const paneRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onOver = (e: DragEvent) => {
      if (!dragHasFiles(e.dataTransfer)) return;
      const t =
        e.target instanceof Element ? e.target.closest<HTMLElement>("[data-drop-folder]") : null;
      const inPane = !!t && !!paneRef.current?.contains(t) && !t.hasAttribute("data-item");
      setOverlay(inPane ? (t?.getAttribute("data-drop-name") ?? folderName) : null);
    };
    const off = () => setOverlay(null);
    const onLeave = (e: DragEvent) => {
      if (!e.relatedTarget) off();
    };
    document.addEventListener("dragover", onOver);
    document.addEventListener("dragleave", onLeave);
    document.addEventListener("drop", off);
    document.addEventListener("dragend", off);
    return () => {
      document.removeEventListener("dragover", onOver);
      document.removeEventListener("dragleave", onLeave);
      document.removeEventListener("drop", off);
      document.removeEventListener("dragend", off);
    };
  }, [folderName]);

  // ─── Status ───────────────────────────────────────────────────────────
  const selKeys = useSelectedKeys(scope);
  const counts = summarize(items);
  const selSummary = useMemo(() => {
    const set = new Set(selKeys);
    return summarize(items.filter((i) => set.has(i.key)));
  }, [items, selKeys]);
  const filtered = !!(text || kinds.length || tag);
  const open = useMemo(() => defaultOpen(navigate), [navigate]);

  // ─── Touch: tap opens, long-press → selection mode (mobile only) ──────
  const [selectMode, setSelectMode] = useState(false);
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset on folder change only
  useEffect(() => setSelectMode(false), [folderId]);
  useEffect(() => {
    if (selKeys.length === 0) setSelectMode(false);
  }, [selKeys.length]);
  const press = useRef<{
    timer: ReturnType<typeof setTimeout> | null;
    x: number;
    y: number;
    fired: boolean;
    touch: boolean;
  }>({ timer: null, x: 0, y: 0, fired: false, touch: false });
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const cancelPress = () => {
    if (press.current.timer) clearTimeout(press.current.timer);
    press.current.timer = null;
  };
  useEffect(
    () => () => {
      if (press.current.timer) clearTimeout(press.current.timer);
    },
    [],
  );
  const itemKeyOf = (t: EventTarget) =>
    (t as Element).closest?.<HTMLElement>("[data-item]")?.dataset.key ?? null;
  const touchHandlers = isMobile
    ? {
        onPointerDownCapture: (e: ReactPointerEvent<HTMLDivElement>) => {
          press.current.touch = e.pointerType === "touch";
          if (!press.current.touch) return;
          const key = itemKeyOf(e.target);
          if (!key) return;
          // Touch selection is driven here, not by the item's own
          // pointer-down (which would single-select on every tap).
          e.stopPropagation();
          cancelPress();
          press.current = {
            timer: setTimeout(() => {
              press.current.timer = null;
              press.current.fired = true;
              setSelectMode(true);
              dispatchSelection(scope, {
                type: "click",
                key,
                mod: true,
                order: itemsRef.current.map((i) => i.key),
              });
              navigator.vibrate?.(10);
            }, 450),
            x: e.clientX,
            y: e.clientY,
            fired: false,
            touch: true,
          };
        },
        onPointerMoveCapture: (e: ReactPointerEvent<HTMLDivElement>) => {
          if (!press.current.timer) return;
          if (Math.hypot(e.clientX - press.current.x, e.clientY - press.current.y) > 10) {
            cancelPress();
          }
        },
        onPointerUpCapture: cancelPress,
        onPointerCancelCapture: cancelPress,
        // The long-press menu (browser `contextmenu` + base-ui's touch
        // timer) would fight selection mode; touch users get the bulk bar.
        onTouchStartCapture: (e: ReactTouchEvent<HTMLDivElement>) => {
          if (itemKeyOf(e.target)) e.stopPropagation();
        },
        onContextMenuCapture: (e: ReactMouseEvent<HTMLDivElement>) => {
          if (!press.current.touch) return;
          e.preventDefault();
          e.stopPropagation();
        },
        onClickCapture: (e: ReactMouseEvent<HTMLDivElement>) => {
          if (!press.current.touch) return;
          const key = itemKeyOf(e.target);
          if (!key || (e.target as Element).closest("[data-inline-rename]")) return;
          e.preventDefault();
          e.stopPropagation();
          if (press.current.fired) {
            press.current.fired = false;
            return;
          }
          if (selectMode) {
            dispatchSelection(scope, {
              type: "click",
              key,
              mod: true,
              order: itemsRef.current.map((i) => i.key),
            });
            return;
          }
          const item = itemsRef.current.find((i) => i.key === key);
          if (item) open(item);
        },
      }
    : {};

  const common = {
    items,
    scope,
    folderId,
    folderName,
    ariaLabel: folderName,
    empty: filtered ? (
      <p className="p-6 font-hand text-2xl text-muted-foreground">Nothing matches the filter.</p>
    ) : (
      <EmptyFolder folderId={folderId} name={folderName} />
    ),
  };

  const sortLabel =
    sorts.length > 1 || !isSortKey(sorts[0]?.key ?? "name")
      ? sorts
          .map(
            (s) =>
              `${isSortKey(s.key) ? SORT_LABELS[s.key] : s.key} ${s.dir === "asc" ? "↑" : "↓"}`,
          )
          .join(", ")
      : undefined;

  return (
    <PageFrame className="relative">
      <ExplorerToolbar
        folderId={folderId}
        path={path}
        filter={text}
        onFilter={setText}
        view={view}
        onView={setView}
      />
      {view !== "columns" ? (
        <ExplorerFilterBar
          kinds={kinds}
          onKinds={setKinds}
          tag={tag}
          onTag={setTag}
          showThumbSlider={view === "grid"}
          sortLabel={sortLabel}
        />
      ) : null}
      <div ref={paneRef} className="relative flex min-h-0 flex-1 flex-col" {...touchHandlers}>
        {loading ? (
          <div className="px-4 py-3.5">
            <SkeletonGrid />
          </div>
        ) : view === "grid" ? (
          <GridView {...common} />
        ) : view === "compact" ? (
          <CompactView {...common} />
        ) : view === "list" ? (
          <ListView
            {...common}
            sort={sorts}
            onSortChange={(next) => {
              const first = next[0];
              if (first && isSortKey(first.key)) setPrefSort({ key: first.key, dir: first.dir });
              setLocalSorts(next.length > 1 || (first && !isSortKey(first.key)) ? next : null);
            }}
          />
        ) : (
          <ColumnsView
            scope={scope}
            folderId={folderId}
            folders={allFolders ?? []}
            prepare={prepare}
            ariaLabel={folderName}
          />
        )}
        <DropOverlay visible={overlay !== null} targetName={overlay ?? folderName} />
      </div>
      <StatusBar
        left={
          <span>
            <b className="font-semibold text-foreground">{counts.folders}</b> folder
            {counts.folders === 1 ? "" : "s"} ·{" "}
            <b className="font-semibold text-foreground">{counts.files}</b> file
            {counts.files === 1 ? "" : "s"}
            {filtered && rawItems ? ` (filtered from ${rawItems.length})` : ""}
            {selKeys.length ? (
              <b className="font-semibold text-accent-foreground">
                {" "}
                · {selKeys.length} selected
                {selSummary.files ? ` · ${formatBytes(selSummary.bytes)}` : ""}
              </b>
            ) : null}
          </span>
        }
      />
      <BulkBar scope={scope} />
      {isMobile && selKeys.length === 0 ? <MobileFab folderId={folderId} /> : null}
      <ExplorerDetails
        scope={scope}
        items={items}
        folder={folder}
        folderId={folderId}
        onOpen={open}
      />
      <QuickLook items={items} scope={scope} onOpen={open} />
    </PageFrame>
  );
}

/** Phones: floating New / Upload button (wireframe screen 23). */
function MobileFab({ folderId }: { folderId: string | null }) {
  const actions = useItemActions();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            aria-label="New or upload"
            data-testid="mobile-fab"
            className="fixed right-4 bottom-[calc(3rem+env(safe-area-inset-bottom))] z-30 grid size-14 place-items-center rounded-full bg-primary text-primary-foreground shadow-[0_10px_30px_-8px_rgba(28,24,20,0.55)] outline-none focus-visible:ring-2 focus-visible:ring-ring/50 active:scale-95"
          />
        }
      >
        <HugeiconsIcon icon={Add01Icon} strokeWidth={2.2} className="size-6" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" side="top" sideOffset={8} className="w-56">
        <DropdownMenuItem onClick={() => void actions.newFile(folderId)}>
          <HugeiconsIcon icon={FileAddIcon} strokeWidth={2} />
          New file…
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => actions.newFolder(folderId)}>
          <HugeiconsIcon icon={FolderAddIcon} strokeWidth={2} />
          New folder
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => openUploadPicker({ folderId })}>
          <HugeiconsIcon icon={Upload01Icon} strokeWidth={2} />
          Upload files…
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
