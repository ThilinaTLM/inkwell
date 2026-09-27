// SharedFolderPage — public folder share (`/share/:token`), wireframe
// screen 21.
//
//   toolbar : [↑] breadcrumb (inside the shared subtree) · filter `/` ·
//             Download all (if allowed) · Grid / Compact / List
//   banner  : Shared by <name> · View only / Can edit · "label" · Sign in
//   pane    : the explorer's GridView / CompactView / ListView, read-only
//   status  : counts · selection
//
// Visitors get the same selection model as the explorer (click, ⌘/⇧,
// arrows, marquee, ↵ opens) plus Space quick look. The context menu is
// local to this page — Open, Quick look, Download, Copy link — so no
// global item commands are registered for anonymous visitors.
//
// The current subfolder lives in `?folder=<id>` so browser back/forward
// walk the subtree. Files open at /share/:token/files/:fileId
// (SharedEditorPage in folder-share mode). Like the previous page this
// one is read-only for every permission: edit links grant editing of the
// files themselves (inside the editor), not create/delete here.

import {
  ArrowUp02Icon,
  Download01Icon,
  EyeIcon,
  FolderOpenIcon,
  GridViewIcon,
  LayoutTwoColumnIcon,
  LeftToRightListBulletIcon,
  Link04Icon,
  PencilEdit02Icon,
  ViewIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import {
  type KeyboardEvent as ReactKeyboardEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { InkwellMark } from "@/components/InkwellMark";
import { PaperSurface } from "@/components/PaperSurface";
import { SkeletonGrid } from "@/components/SkeletonGrid";
import { StatusBar, ToolbarSearch } from "@/components/shell/page";
import { EmptyDeskNote } from "@/components/sketch/EmptyDeskNote";
import { Button } from "@/components/ui/button";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { useMe } from "@/data/auth";
import { useSharedFolder } from "@/data/shares";
import {
  type ExplorerItem,
  fileToItem,
  filterItems,
  folderToItem,
  formatBytes,
  sortItems,
  summarize,
} from "@/features/explorer/model";
import { QuickLook } from "@/features/explorer/QuickLook";
import { dispatchSelection, getSelState, useSelectedKeys } from "@/features/explorer/state";
import { CompactView } from "@/features/explorer/views/CompactView";
import { GridView } from "@/features/explorer/views/GridView";
import { ListView } from "@/features/explorer/views/ListView";
import { folderPath } from "@/features/folders/FolderTree";
import type { FolderMeta, FolderSharePayload } from "@/lib/api/client";
import { shares } from "@/lib/api/client";
import { copyToClipboard } from "@/lib/clipboard";
import { requestQuickLook } from "@/lib/commands/signals";
import { errorMessage } from "@/lib/errors";
import { expiresPhrase } from "@/lib/format";
import { parseRefKey } from "@/lib/selection";
import { useMediaQuery } from "@/lib/useMediaQuery";
import { cn } from "@/lib/utils";
import { downloadShareZip, triggerDownload } from "./shared/shareZip";

interface SharedFolderProps {
  /** Optional preloaded payload; used by SharedTokenLanding. */
  preloaded?: FolderSharePayload;
}

type ShareView = "grid" | "compact" | "list";
const VIEW_KEY = "inkwell.share.view";
const VIEWS: Array<{ id: ShareView; label: string; icon: IconSvgElement }> = [
  { id: "grid", label: "Grid", icon: GridViewIcon },
  { id: "compact", label: "Compact", icon: LayoutTwoColumnIcon },
  { id: "list", label: "List", icon: LeftToRightListBulletIcon },
];

function readView(fallback: ShareView): ShareView {
  try {
    const v = localStorage.getItem(VIEW_KEY);
    return v === "grid" || v === "compact" || v === "list" ? v : fallback;
  } catch {
    return fallback;
  }
}

export default function SharedFolderPage({ preloaded }: SharedFolderProps = {}) {
  const { token = "" } = useParams<{ token: string }>();
  const folderQuery = useSharedFolder(preloaded ? "" : token);
  const payload = preloaded ?? folderQuery.data ?? null;

  if (folderQuery.isError) {
    return (
      <PaperSurface variant="page" className="grid place-items-center px-4">
        <EmptyDeskNote
          seed="shared-folder-error"
          title="Couldn't load this folder"
          body={errorMessage(folderQuery.error, "could not load shared folder")}
        />
      </PaperSurface>
    );
  }
  if (!payload) {
    return (
      <PaperSurface variant="page" className="px-6 py-6">
        <div className="space-y-4">
          <div className="h-10 w-2/3 max-w-sm animate-pulse rounded-md bg-muted/60" />
          <SkeletonGrid count={6} />
        </div>
      </PaperSurface>
    );
  }
  return <SharedFolderExplorer token={token} payload={payload} />;
}

function SharedFolderExplorer({ token, payload }: { token: string; payload: FolderSharePayload }) {
  const navigate = useNavigate();
  const me = useMe();
  const [search, setSearch] = useSearchParams();
  const isMobile = useMediaQuery("(max-width: 767px)");
  const { share, root } = payload;
  const writable = share.permission === "write";
  const allowDownload = share.allowDownload;

  const allFolders = useMemo(() => {
    const m = new Map<string, FolderMeta>(payload.folders.map((f) => [f.id, f]));
    if (!m.has(root.id)) m.set(root.id, root);
    return [...m.values()];
  }, [payload.folders, root]);

  // Current folder (inside the subtree; anything else falls back to root).
  const folderParam = search.get("folder");
  const folderId =
    folderParam && allFolders.some((f) => f.id === folderParam) ? folderParam : root.id;
  const current = allFolders.find((f) => f.id === folderId) ?? root;
  const path = useMemo(() => {
    const p = folderPath(allFolders, folderId);
    const i = p.findIndex((f) => f.id === root.id);
    return i >= 0 ? p.slice(i) : [root];
  }, [allFolders, folderId, root]);

  const goFolder = useCallback(
    (id: string) => {
      const next = new URLSearchParams(search);
      if (id === root.id) next.delete("folder");
      else next.set("folder", id);
      setSearch(next);
    },
    [search, setSearch, root.id],
  );

  const [view, setViewState] = useState<ShareView>(() => readView(isMobile ? "list" : "grid"));
  const setView = (v: ShareView) => {
    setViewState(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      /* ignore */
    }
  };
  const [text, setText] = useState("");
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset on folder change only
  useEffect(() => setText(""), [folderId]);

  const scope = `share:${token}:${folderId}`;
  const thumbUrl = useCallback(
    (fileId: string, v: number) => `${shares.folderFileThumbUrl(token, fileId)}?v=${v}`,
    [token],
  );

  const rawItems = useMemo<ExplorerItem[]>(() => {
    const folders = allFolders
      .filter((f) => f.parentId === folderId && f.id !== root.id)
      .map((f) => {
        const it = folderToItem(f);
        const p = f.previews?.[0];
        return {
          ...it,
          starred: false,
          shareCount: 0,
          thumbUrl: p?.hasThumb ? thumbUrl(p.id, p.thumbUpdatedAt) : null,
        };
      });
    const files = payload.files
      .filter((f) => f.folderId === folderId)
      .map((f) => ({
        ...fileToItem(f, { thumbUrl: (m) => thumbUrl(m.id, m.thumbUpdatedAt) }),
        starred: false,
        shareCount: 0,
      }));
    return [...folders, ...files];
  }, [allFolders, payload.files, folderId, root.id, thumbUrl]);

  const items = useMemo(
    () => sortItems(filterItems(rawItems, { text }), { key: "name", dir: "asc" }),
    [rawItems, text],
  );
  const itemsRef = useRef(items);
  itemsRef.current = items;

  const open = useCallback(
    (item: ExplorerItem) => {
      if (item.type === "folder") goFolder(item.id);
      else navigate(`/share/${token}/files/${item.id}`);
    },
    [goFolder, navigate, token],
  );

  // ─── Download ─────────────────────────────────────────────────────
  const zip = useCallback(
    async (folderIds: string[], fileIds: string[], zipName: string) => {
      const id = toast.loading("Preparing zip…");
      try {
        await downloadShareZip({
          token,
          folders: allFolders,
          files: payload.files,
          pickFolderIds: folderIds,
          pickFileIds: fileIds,
          zipName,
          onProgress: (d, t) => toast.loading(`Zipping ${d}/${t} files…`, { id }),
        });
        toast.success("Download ready", { id });
      } catch (e) {
        toast.error(errorMessage(e, "could not build zip"), { id });
      }
    },
    [token, allFolders, payload.files],
  );

  const download = useCallback(
    (targets: ExplorerItem[]) => {
      if (!allowDownload || !targets.length) return;
      if (targets.length === 1 && targets[0].type === "file") {
        triggerDownload(shares.folderFileDownloadUrl(token, targets[0].id));
        return;
      }
      const name =
        targets.length === 1 ? `${targets[0].name}.zip` : `${current.name} (selection).zip`;
      void zip(
        targets.filter((t) => t.type === "folder").map((t) => t.id),
        targets.filter((t) => t.type === "file").map((t) => t.id),
        name,
      );
    },
    [allowDownload, token, current.name, zip],
  );

  const copyLink = useCallback(
    async (item: ExplorerItem) => {
      const url =
        item.type === "file"
          ? `${location.origin}/share/${token}/files/${item.id}`
          : `${location.origin}/share/${token}${item.id === root.id ? "" : `?folder=${item.id}`}`;
      const ok = await copyToClipboard(url);
      if (ok) toast.success("Link copied");
      else toast.error("Couldn't access the clipboard");
    },
    [token, root.id],
  );

  // ─── Page keys: `/` filter, Space quick look, Backspace up ────────
  const filterWrapRef = useRef<HTMLDivElement>(null);
  const focusedItem = () => {
    const s = getSelState(scope);
    const k = s.focus ?? s.selected[0];
    return k ? itemsRef.current.find((i) => i.key === k) : undefined;
  };
  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const t = e.target as HTMLElement;
    if (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable) return;
    if (document.querySelector('[role="dialog"]:not([data-closed]),[role="menu"]')) return;
    if (e.key === "/" && !e.metaKey && !e.ctrlKey) {
      e.preventDefault();
      filterWrapRef.current?.querySelector("input")?.focus();
    } else if (e.key === " " && !e.metaKey && !e.ctrlKey) {
      const it = focusedItem();
      if (it) {
        e.preventDefault();
        requestQuickLook(it.ref);
      }
    } else if (
      (e.key === "Backspace" || (e.key === "ArrowUp" && (e.metaKey || e.altKey))) &&
      path.length > 1
    ) {
      e.preventDefault();
      goFolder(path[path.length - 2].id);
    }
  };

  const selKeys = useSelectedKeys(scope);
  const selItems = useMemo(() => items.filter((i) => selKeys.includes(i.key)), [items, selKeys]);
  const counts = summarize(items);
  const selSummary = summarize(selItems);

  const common = {
    items,
    scope,
    readOnly: true,
    onOpen: open,
    menu: false as const,
    ariaLabel: current.name,
    empty: (
      <div className="grid h-full place-items-center px-6 py-16 text-center text-sm text-muted-foreground">
        {text ? `Nothing matches “${text}”.` : `“${current.name}” is empty.`}
      </div>
    ),
  };

  const sharerName = share.sharedBy
    ? `${share.sharedBy.firstName} ${share.sharedBy.lastName}`.trim()
    : "";

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: page-level keyboard shortcuts
    <div
      className="flex h-dvh flex-col overflow-hidden bg-background text-foreground"
      onKeyDown={onKeyDown}
    >
      {/* Top bar: wordmark + sign in */}
      <header className="flex h-11 shrink-0 items-center gap-2 border-b border-border px-3">
        <Link to="/" className="flex items-center gap-1.5 text-foreground" aria-label="Inkwell">
          <InkwellMark className="size-5" />
          <span className="font-brand text-lg leading-none">inkwell</span>
        </Link>
        <span className="min-w-0 flex-1" />
        {me.data ? (
          <Button variant="ghost" size="sm" nativeButton={false} render={<Link to="/" />}>
            Open Inkwell
          </Button>
        ) : me.data === null ? (
          <Button variant="ghost" size="sm" nativeButton={false} render={<Link to="/login" />}>
            Sign in
          </Button>
        ) : null}
      </header>

      {/* Toolbar */}
      <div className="flex h-12 shrink-0 items-center gap-1.5 border-b border-border px-2 sm:px-3">
        <Button
          variant="ghost"
          size="icon"
          aria-label="Up one folder"
          title="Up one folder (Backspace)"
          disabled={path.length <= 1}
          onClick={() => goFolder(path[path.length - 2].id)}
        >
          <HugeiconsIcon icon={ArrowUp02Icon} strokeWidth={2} />
        </Button>
        <nav
          aria-label="Folder path"
          className="flex min-w-0 flex-1 items-center gap-0.5 overflow-hidden text-sm"
        >
          {path.map((f, i) => {
            const last = i === path.length - 1;
            // On phones only the current folder is shown.
            return (
              <span
                key={f.id}
                className={cn("min-w-0 items-center gap-0.5", last ? "flex" : "hidden sm:flex")}
              >
                {i > 0 ? <span className="px-0.5 text-muted-foreground/60">›</span> : null}
                <button
                  type="button"
                  onClick={() => goFolder(f.id)}
                  aria-current={last ? "page" : undefined}
                  className={cn(
                    "truncate rounded-sm px-1 py-0.5 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
                    last ? "font-semibold text-foreground" : "text-muted-foreground",
                  )}
                >
                  {f.name}
                </button>
              </span>
            );
          })}
        </nav>
        <div ref={filterWrapRef} className="hidden sm:block">
          <ToolbarSearch value={text} onChange={setText} className="w-44" />
        </div>
        {allowDownload ? (
          <Button
            variant="outline"
            size="sm"
            onClick={() => void zip([current.id], [], `${current.name}.zip`)}
            title="Download everything in this folder as a zip"
          >
            <HugeiconsIcon icon={Download01Icon} strokeWidth={1.8} />
            <span className="hidden sm:inline">Download all</span>
          </Button>
        ) : null}
        <fieldset className="flex items-center rounded-md border border-border p-0.5">
          <legend className="sr-only">View</legend>
          {VIEWS.map((v) => (
            <button
              key={v.id}
              type="button"
              aria-pressed={view === v.id}
              aria-label={`${v.label} view`}
              title={`${v.label} view`}
              onClick={() => setView(v.id)}
              className={cn(
                "inline-flex size-7 items-center justify-center rounded-[5px] text-muted-foreground hover:text-foreground",
                view === v.id && "bg-accent text-accent-foreground",
              )}
            >
              <HugeiconsIcon icon={v.icon} strokeWidth={1.8} className="size-4" />
            </button>
          ))}
        </fieldset>
      </div>

      {/* Ownership banner */}
      <div
        data-testid="share-banner"
        className="flex shrink-0 flex-wrap items-center gap-x-2 gap-y-1 border-b border-border bg-primary/[0.06] px-3 py-2 text-[12.5px] sm:px-4"
      >
        <HugeiconsIcon
          icon={writable ? PencilEdit02Icon : EyeIcon}
          strokeWidth={1.8}
          className="size-4 text-muted-foreground"
        />
        <span>
          {sharerName ? (
            <>
              Shared by <b className="font-semibold">{sharerName}</b>
            </>
          ) : (
            "Shared folder"
          )}
          {" · "}
          <span className="rounded-full bg-accent px-2 py-0.5 text-accent-foreground">
            {writable ? "Can edit" : "View only"}
          </span>
          {share.label ? <span className="text-muted-foreground"> · “{share.label}”</span> : null}
          {expiresPhrase(share.expiresAt ?? null) ? (
            <span className="text-muted-foreground">
              {" "}
              · link {expiresPhrase(share.expiresAt ?? null)}
            </span>
          ) : null}
        </span>
        {writable ? <span className="text-muted-foreground">· open a file to edit it</span> : null}
      </div>

      {/* Mobile filter row */}
      <div className="border-b border-border px-2 py-1.5 sm:hidden">
        <ToolbarSearch value={text} onChange={setText} className="w-full" />
      </div>

      <ShareContextMenu
        scope={scope}
        items={items}
        allowDownload={allowDownload}
        onOpen={open}
        onDownload={download}
        onCopyLink={(i) => void copyLink(i)}
      >
        {view === "grid" ? (
          <GridView {...common} />
        ) : view === "compact" ? (
          <CompactView {...common} />
        ) : (
          <ListView
            {...common}
            columns={["name", "kind", "modified", "size"]}
            persistColumns={false}
          />
        )}
      </ShareContextMenu>

      <StatusBar
        left={
          <span>
            <b className="font-semibold text-foreground">{counts.folders}</b> folder
            {counts.folders === 1 ? "" : "s"} ·{" "}
            <b className="font-semibold text-foreground">{counts.files}</b> file
            {counts.files === 1 ? "" : "s"}
            {selItems.length ? (
              <b className="font-semibold text-accent-foreground">
                {" "}
                · {selItems.length} selected
                {selSummary.files ? ` · ${formatBytes(selSummary.bytes)}` : ""}
              </b>
            ) : null}
          </span>
        }
        right={
          <span className="hidden sm:inline">
            {writable ? "Can edit files" : "Read-only"} · right-click for Open / Download / Copy
            link
          </span>
        }
      />
      <QuickLook items={items} scope={scope} onOpen={open} />
    </div>
  );
}

// ─── Local context menu ─────────────────────────────────────────────────

function ShareContextMenu({
  scope,
  items,
  allowDownload,
  onOpen,
  onDownload,
  onCopyLink,
  children,
}: {
  scope: string;
  items: ExplorerItem[];
  allowDownload: boolean;
  onOpen: (item: ExplorerItem) => void;
  onDownload: (items: ExplorerItem[]) => void;
  onCopyLink: (item: ExplorerItem) => void;
  children: React.ReactNode;
}) {
  const lastTarget = useRef<Element | null>(null);
  const [open, setOpen] = useState(false);
  const [targets, setTargets] = useState<ExplorerItem[]>([]);

  const resolve = (): boolean => {
    const el = lastTarget.current?.closest<HTMLElement>("[data-item]");
    const key = el?.dataset.key;
    const item = key ? items.find((i) => i.key === key) : undefined;
    if (!item) return false;
    const order = items.map((i) => i.key);
    let sel = getSelState(scope).selected;
    if (!sel.includes(item.key)) {
      dispatchSelection(scope, { type: "click", key: item.key, order });
      sel = [item.key];
    }
    const picked = sel
      .map((k) => (parseRefKey(k) ? items.find((i) => i.key === k) : undefined))
      .filter((i): i is ExplorerItem => !!i);
    setTargets(picked.length ? picked : [item]);
    return true;
  };

  const primary = targets[0];
  const many = targets.length > 1;

  return (
    <ContextMenu
      open={open}
      onOpenChange={(o) => {
        // Only items get a menu; the background has nothing to offer.
        if (o && !resolve()) return;
        setOpen(o);
      }}
    >
      <ContextMenuTrigger
        render={
          <div
            className="relative flex min-h-0 flex-1 flex-col"
            onContextMenuCapture={(e) => {
              lastTarget.current = e.target as Element;
            }}
            onTouchStartCapture={(e) => {
              lastTarget.current = e.target as Element;
            }}
          />
        }
      >
        {children}
      </ContextMenuTrigger>
      <ContextMenuContent className="min-w-52">
        {primary && !many ? (
          <>
            <ContextMenuItem onClick={() => onOpen(primary)}>
              <HugeiconsIcon icon={FolderOpenIcon} strokeWidth={1.8} />
              Open
              <ContextMenuShortcut>↵</ContextMenuShortcut>
            </ContextMenuItem>
            <ContextMenuItem onClick={() => requestQuickLook(primary.ref)}>
              <HugeiconsIcon icon={ViewIcon} strokeWidth={1.8} />
              Quick look
              <ContextMenuShortcut>Space</ContextMenuShortcut>
            </ContextMenuItem>
          </>
        ) : null}
        {allowDownload && primary ? (
          <ContextMenuItem onClick={() => onDownload(targets)}>
            <HugeiconsIcon icon={Download01Icon} strokeWidth={1.8} />
            {many
              ? `Download ${targets.length} items (.zip)`
              : primary.type === "folder"
                ? "Download (.zip)"
                : "Download"}
          </ContextMenuItem>
        ) : null}
        {primary && !many ? (
          <>
            <ContextMenuSeparator />
            <ContextMenuItem onClick={() => onCopyLink(primary)}>
              <HugeiconsIcon icon={Link04Icon} strokeWidth={1.8} />
              Copy link
            </ContextMenuItem>
          </>
        ) : null}
      </ContextMenuContent>
    </ContextMenu>
  );
}
