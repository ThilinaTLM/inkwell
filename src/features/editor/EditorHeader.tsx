// EditorHeader — the single 44px bar above every editor (screen 20 of
// docs/wireframes/inkwell-redesign.html).
//
//   [←] ⌂ › Folder › Sub › [kind] name  ✓ Saved · v12   ···toolbar  ☆ [Share] ⋯ ⌨ (avatar)
//
// Owner mode (`EditorPage`): clickable breadcrumb, inline rename,
// star, Share, ⋯ menu (Rename / Move / Duplicate / Download / Tags /
// Trash), shortcuts and the account menu.
//
// Visitor mode (`SharedEditorPage`, `visitor` prop): no owner actions;
// shows "Shared · View only / Can edit" and a download button when the
// link allows it.
//
// Save state comes from the editor's own lifecycle through the
// `EditorHeaderBridge` (see `./editorHeaderBridge.ts`); every
// navigation the header triggers goes through `bridge.requestLeave` so
// the editor's leave-confirm dialog still guards unsaved work.
//
// Keyboard:
//   • mod+[          back (window listener, bubble phase — editors that
//                    consume the chord themselves, e.g. Excalidraw's
//                    "send backward" while editing, keep it)
//   • Esc Esc        back, only while focus is inside the header (so we
//                    never steal Esc from Excalidraw / draw.io / BlockNote)
//   • F2             inline rename (owner, not while typing in a field)

import {
  Alert02Icon,
  ArrowLeft01Icon,
  ArrowRight01Icon,
  CheckmarkCircle02Icon,
  Copy01Icon,
  Delete02Icon,
  Download01Icon,
  Edit02Icon,
  EyeIcon,
  FolderExportIcon,
  HashtagIcon,
  Home01Icon,
  KeyboardIcon,
  Loading03Icon,
  MoreHorizontalIcon,
  PencilEdit02Icon,
  RefreshIcon,
  Share08Icon,
  StarIcon,
  WifiDisconnected01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useQuery } from "@tanstack/react-query";
import {
  type KeyboardEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { Link } from "react-router-dom";
import { FileKindGlyph } from "@/components/sketch/file-kind-icons";
import { UserMenu } from "@/components/UserMenu";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useFolders } from "@/data/folders";
import { folderPath } from "@/features/folders/FolderTree";
import { auth, type FileKind } from "@/lib/api/client";
import { keys } from "@/lib/api/query-keys";
import { cn } from "@/lib/utils";
import type { EditorHeaderBridge } from "./editorHeaderBridge";

export interface EditorHeaderFile {
  id: string;
  name: string;
  kind: FileKind;
  version: number;
  folderId: string | null;
}

export interface EditorHeaderVisitor {
  /** Display name of the sharer when known (the share API doesn't
   *  expose it yet — falls back to "Shared"). */
  sharedBy?: string | null;
  permission: "read" | "write";
  allowDownload: boolean;
  onDownload?: () => void;
}

export interface EditorHeaderProps {
  bridge: EditorHeaderBridge;
  file: EditorHeaderFile;
  /** Back affordance. Omit / `null` to hide (top-level share token). */
  onBack?: (() => void) | null;
  backLabel?: string;
  /** Visitor (share-token) mode. Hides every owner action. */
  visitor?: EditorHeaderVisitor | null;
  /** Navigate to a breadcrumb folder (`null` = Home). Owner only. */
  onNavigateFolder?: (folderId: string | null) => void;
  /** Commit an inline rename. Resolve `false` to keep the field open. */
  onRename?: (next: string) => Promise<boolean>;
  starred?: boolean;
  onToggleStar?: () => void;
  onShare?: () => void;
  onMove?: () => void;
  onDuplicate?: () => void;
  onDownload?: () => void;
  onEditTags?: () => void;
  onTrash?: () => void;
  /** Overrides the built-in shortcuts dialog (lead will wire the shared one). */
  onShowShortcuts?: () => void;
  /** Non-blocking conflict banner (another tab/device saved a newer version). */
  conflict?: { onReload: () => void; onDismiss: () => void } | null;
}

const IS_MAC = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
const MOD = IS_MAC ? "⌘" : "Ctrl+";

function isTypingTarget(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false;
  const tag = t.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

export function EditorHeader(props: EditorHeaderProps) {
  const { bridge, file, onBack, backLabel = "Back to folder", visitor, onRename } = props;
  const isVisitor = !!visitor;
  const canRename = !isVisitor && !!onRename;
  const [renaming, setRenaming] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  // Read the session from the cache only. `App` already probes `/api/me`;
  // a second *fetching* observer on a public route would reset the
  // errored (anonymous) query to pending on mount, flip App back to its
  // boot splash, unmount us, and loop.
  const me = useQuery({ queryKey: keys.me, queryFn: () => auth.me(), enabled: false });

  const goBack = useCallback(() => {
    if (!onBack) return;
    bridge.requestLeave(onBack);
  }, [bridge, onBack]);

  // Live refs so the window listener binds once.
  const goBackRef = useRef(goBack);
  goBackRef.current = goBack;
  const canRenameRef = useRef(canRename);
  canRenameRef.current = canRename;

  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.defaultPrevented) return;
      const mod = e.metaKey || e.ctrlKey;
      if (mod && !e.shiftKey && !e.altKey && e.code === "BracketLeft") {
        e.preventDefault();
        goBackRef.current();
        return;
      }
      if (e.key === "F2" && !mod && canRenameRef.current && !isTypingTarget(e.target)) {
        e.preventDefault();
        setRenaming(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Esc Esc while focus is inside the header.
  const lastEscRef = useRef(0);
  const onHeaderKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    if (e.key !== "Escape" || isTypingTarget(e.target)) return;
    const now = Date.now();
    if (now - lastEscRef.current < 600) {
      lastEscRef.current = 0;
      e.preventDefault();
      goBack();
    } else {
      lastEscRef.current = now;
    }
  };

  const showShortcuts = () => {
    if (props.onShowShortcuts) props.onShowShortcuts();
    else setShortcutsOpen(true);
  };

  const readOnly = isVisitor && visitor.permission !== "write";

  return (
    <div className="relative z-20 shrink-0">
      <header
        role="toolbar"
        aria-label="File"
        onKeyDown={onHeaderKeyDown}
        className={cn(
          "flex h-11 items-center gap-1 border-b border-border/70 bg-background px-1.5 sm:gap-1.5 sm:px-2",
        )}
      >
        {onBack ? (
          <Button
            variant="ghost"
            size="icon"
            onClick={goBack}
            aria-label={backLabel}
            title={`${backLabel} (${MOD}[)`}
          >
            <HugeiconsIcon icon={ArrowLeft01Icon} strokeWidth={2} />
          </Button>
        ) : null}

        <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-0.5 text-sm">
          {isVisitor ? null : (
            <OwnerCrumbs
              folderId={file.folderId}
              onNavigate={(fid) => {
                if (props.onNavigateFolder) {
                  const nav = props.onNavigateFolder;
                  bridge.requestLeave(() => nav(fid));
                }
              }}
            />
          )}
          <span className="flex min-w-0 items-center gap-1.5" aria-current="page">
            <FileKindGlyph kind={file.kind} className="size-4 shrink-0" />
            {renaming && canRename ? (
              <InlineRename
                initial={file.name}
                onCommit={async (next) => {
                  const ok = next === file.name || !onRename ? true : await onRename(next);
                  if (ok) setRenaming(false);
                  return ok;
                }}
                onCancel={() => setRenaming(false)}
              />
            ) : canRename ? (
              <button
                type="button"
                onClick={() => setRenaming(true)}
                title="Rename (F2)"
                data-testid="editor-file-name"
                className={cn(
                  "min-w-0 max-w-[16rem] truncate rounded-sm px-1 py-0.5 font-heading font-semibold text-foreground sm:max-w-[28rem]",
                  "cursor-text hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
                )}
              >
                {file.name}
              </button>
            ) : (
              <span
                title={file.name}
                data-testid="editor-file-name"
                className="min-w-0 max-w-[16rem] truncate px-1 font-heading font-semibold text-foreground sm:max-w-[28rem]"
              >
                {file.name}
              </span>
            )}
          </span>
        </nav>

        {readOnly ? null : <SaveIndicator bridge={bridge} version={file.version} />}

        {isVisitor ? <VisitorChip visitor={visitor} /> : null}

        <div className="min-w-0 flex-1" />

        {bridge.toolbar ? (
          <div className="flex items-center gap-0.5">
            {bridge.toolbar}
            <span aria-hidden className="mx-1 hidden h-5 w-px bg-border sm:block" />
          </div>
        ) : null}

        {isVisitor ? (
          <VisitorActions visitor={visitor} extras={bridge.menuExtras} />
        ) : (
          <OwnerActions {...props} onRenameRequest={() => setRenaming(true)} />
        )}

        <Button
          variant="ghost"
          size="icon"
          className="hidden sm:inline-flex"
          onClick={showShortcuts}
          aria-label="Keyboard shortcuts"
          title="Keyboard shortcuts"
        >
          <HugeiconsIcon icon={KeyboardIcon} strokeWidth={1.8} />
        </Button>

        {me.data ? (
          <UserMenu user={me.data} />
        ) : isVisitor && me.isError ? (
          <Button variant="ghost" size="sm" nativeButton={false} render={<Link to="/login" />}>
            Sign in
          </Button>
        ) : null}
      </header>

      {props.conflict ? <ConflictBanner {...props.conflict} /> : null}

      <ShortcutsDialog
        open={shortcutsOpen}
        onOpenChange={setShortcutsOpen}
        owner={!isVisitor}
        hasBack={!!onBack}
      />
    </div>
  );
}

// ─── Breadcrumb ──────────────────────────────────────────────────────

function OwnerCrumbs({
  folderId,
  onNavigate,
}: {
  folderId: string | null;
  onNavigate: (folderId: string | null) => void;
}) {
  const foldersQuery = useFolders();
  const path = folderId && foldersQuery.data ? folderPath(foldersQuery.data, folderId) : [];
  // Collapse long paths: Home › first › … › last two.
  const shown =
    path.length > 3
      ? [path[0], null, path[path.length - 2], path[path.length - 1]]
      : (path as Array<(typeof path)[number] | null>);

  const sep = (
    <HugeiconsIcon
      icon={ArrowRight01Icon}
      strokeWidth={2}
      aria-hidden
      className="size-3 shrink-0 text-muted-foreground/60"
    />
  );

  return (
    <>
      <button
        type="button"
        onClick={() => onNavigate(null)}
        title="Home"
        aria-label="Home"
        className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
      >
        <HugeiconsIcon icon={Home01Icon} strokeWidth={1.8} className="size-4" />
      </button>
      {sep}
      {shown.map((f, i) =>
        f ? (
          <span key={f.id} className="flex min-w-0 items-center gap-0.5">
            <button
              type="button"
              onClick={() => onNavigate(f.id)}
              title={f.name}
              className={cn(
                "hidden min-w-0 max-w-[10rem] truncate rounded-sm px-1 py-0.5 text-muted-foreground md:inline",
                "hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
              )}
            >
              {f.name}
            </button>
            <span className="hidden md:inline">{sep}</span>
          </span>
        ) : (
          <span
            // biome-ignore lint/suspicious/noArrayIndexKey: the ellipsis slot is positional
            key={`ellipsis-${i}`}
            className="hidden items-center gap-0.5 text-muted-foreground md:flex"
          >
            …{sep}
          </span>
        ),
      )}
    </>
  );
}

// ─── Inline rename ───────────────────────────────────────────────────

function InlineRename({
  initial,
  onCommit,
  onCancel,
}: {
  initial: string;
  onCommit: (next: string) => Promise<boolean>;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(initial);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const doneRef = useRef(false);

  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.focus();
    el.select();
  }, []);

  const commit = async () => {
    if (doneRef.current || busy) return;
    const next = value.trim();
    if (!next) {
      doneRef.current = true;
      onCancel();
      return;
    }
    setBusy(true);
    doneRef.current = true;
    const ok = await onCommit(next);
    setBusy(false);
    if (!ok) {
      doneRef.current = false;
      inputRef.current?.focus();
    }
  };

  return (
    <input
      ref={inputRef}
      aria-label="File name"
      data-testid="editor-rename-input"
      value={value}
      disabled={busy}
      maxLength={200}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          void commit();
        } else if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          doneRef.current = true;
          onCancel();
        }
      }}
      onBlur={() => void commit()}
      size={Math.min(Math.max(value.length + 1, 8), 48)}
      className="h-7 min-w-0 rounded-md border border-input bg-background px-1.5 font-heading text-sm font-semibold text-foreground outline-none focus:border-ring focus:ring-2 focus:ring-ring/30"
    />
  );
}

// ─── Save indicator ──────────────────────────────────────────────────

function isConflictMessage(msg: string | null): boolean {
  return !!msg && /^(Refreshed:|Conflict)/.test(msg);
}

function useOnline(): boolean {
  const [online, setOnline] = useState(() =>
    typeof navigator === "undefined" ? true : navigator.onLine,
  );
  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
    };
  }, []);
  return online;
}

function SaveIndicator({ bridge, version }: { bridge: EditorHeaderBridge; version: number }) {
  const online = useOnline();
  const { status, errorMessage, saveNow } = bridge;
  if (status === null) return null;

  let icon: ReactNode;
  let label: string;
  let title: string;
  let tone = "text-muted-foreground";
  let interactive = false;

  switch (status) {
    case "loading":
      icon = <HugeiconsIcon icon={Loading03Icon} strokeWidth={2} className="animate-spin" />;
      label = "Loading…";
      title = label;
      break;
    case "saving":
      icon = <HugeiconsIcon icon={Loading03Icon} strokeWidth={2} className="animate-spin" />;
      label = "Saving…";
      title = label;
      break;
    case "dirty":
      icon = <span aria-hidden className="size-1.5 rounded-full bg-primary" />;
      label = "Edited";
      title = "Unsaved changes — click to save now";
      tone = "text-foreground";
      interactive = !!saveNow;
      break;
    case "error":
      if (isConflictMessage(errorMessage)) {
        icon = <HugeiconsIcon icon={Alert02Icon} strokeWidth={2} />;
        label = "Conflict";
        title = errorMessage ?? "Conflict";
        tone = "text-destructive";
      } else if (!online || /fetch|network|offline/i.test(errorMessage ?? "")) {
        icon = <HugeiconsIcon icon={WifiDisconnected01Icon} strokeWidth={2} />;
        label = "Offline — retry";
        title = errorMessage ?? "You appear to be offline — click to retry";
        tone = "text-destructive";
        interactive = !!saveNow;
      } else {
        icon = <HugeiconsIcon icon={Alert02Icon} strokeWidth={2} />;
        label = "Save failed — retry";
        title = errorMessage ?? "Save failed — click to retry";
        tone = "text-destructive";
        interactive = !!saveNow;
      }
      break;
    default:
      icon = <HugeiconsIcon icon={CheckmarkCircle02Icon} strokeWidth={2} />;
      label = `Saved · v${version}`;
      title = `All changes saved (version ${version})`;
  }

  const cls = cn(
    "inline-flex h-7 shrink-0 items-center gap-1.5 rounded-md px-1.5 text-xs whitespace-nowrap [&_svg]:size-3.5",
    tone,
  );
  const text = <span className="hidden sm:inline">{label}</span>;

  if (interactive && saveNow) {
    return (
      <button
        type="button"
        onClick={saveNow}
        title={title}
        aria-label={title}
        data-testid="editor-save-state"
        data-status={status}
        className={cn(
          cls,
          "hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
        )}
      >
        {icon}
        {text}
      </button>
    );
  }
  return (
    <output
      title={title}
      aria-label={title}
      aria-live="polite"
      data-testid="editor-save-state"
      data-status={status}
      className={cls}
    >
      {icon}
      {text}
    </output>
  );
}

// ─── Visitor bits ────────────────────────────────────────────────────

function VisitorChip({ visitor }: { visitor: EditorHeaderVisitor }) {
  const canEdit = visitor.permission === "write";
  return (
    <span
      data-testid="editor-visitor-chip"
      className="hidden shrink-0 items-center gap-1.5 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground sm:inline-flex"
    >
      <HugeiconsIcon
        icon={canEdit ? PencilEdit02Icon : EyeIcon}
        strokeWidth={1.8}
        className="size-3.5"
      />
      {visitor.sharedBy ? (
        <>
          Shared by <b className="font-medium text-foreground">{visitor.sharedBy}</b> ·
        </>
      ) : (
        "Shared ·"
      )}{" "}
      {canEdit ? "Can edit" : "View only"}
    </span>
  );
}

function VisitorActions({
  visitor,
  extras,
}: {
  visitor: EditorHeaderVisitor;
  extras?: EditorHeaderBridge["menuExtras"];
}) {
  if (!visitor.allowDownload) return null;
  return (
    <>
      {visitor.onDownload ? (
        <Button variant="outline" size="sm" onClick={visitor.onDownload} title="Download">
          <HugeiconsIcon icon={Download01Icon} strokeWidth={1.8} />
          <span className="hidden sm:inline">Download</span>
        </Button>
      ) : null}
      {extras?.length ? (
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button variant="ghost" size="icon" aria-label="More actions" title="More actions">
                <HugeiconsIcon icon={MoreHorizontalIcon} strokeWidth={1.8} />
              </Button>
            }
          />
          <DropdownMenuContent align="end" className="w-auto min-w-52">
            {extras.map((x) => (
              <DropdownMenuItem key={x.id} onClick={x.onSelect}>
                {x.icon}
                {x.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </>
  );
}

// ─── Owner actions ───────────────────────────────────────────────────

function OwnerActions({
  bridge,
  starred,
  onToggleStar,
  onShare,
  onMove,
  onDuplicate,
  onDownload,
  onEditTags,
  onTrash,
  onRename,
  onRenameRequest,
}: EditorHeaderProps & { onRenameRequest: () => void }) {
  const extras = bridge.menuExtras ?? [];
  return (
    <>
      {onToggleStar ? (
        <Button
          variant="ghost"
          size="icon"
          onClick={onToggleStar}
          aria-pressed={!!starred}
          aria-label={starred ? "Unstar" : "Star"}
          title={starred ? "Unstar" : "Star"}
          data-testid="editor-star"
        >
          <HugeiconsIcon
            icon={StarIcon}
            strokeWidth={1.8}
            className={cn(starred && "fill-amber-400 text-amber-500")}
          />
        </Button>
      ) : null}
      {onShare ? (
        <Button variant="outline" size="sm" onClick={onShare} title="Share">
          <HugeiconsIcon icon={Share08Icon} strokeWidth={1.8} />
          <span className="hidden sm:inline">Share</span>
        </Button>
      ) : null}
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="icon"
              aria-label="File actions"
              title="File actions"
              data-testid="editor-more"
            >
              <HugeiconsIcon icon={MoreHorizontalIcon} strokeWidth={1.8} />
            </Button>
          }
        />
        <DropdownMenuContent align="end" className="w-auto min-w-56">
          {onRename ? (
            <DropdownMenuItem onClick={onRenameRequest}>
              <HugeiconsIcon icon={Edit02Icon} strokeWidth={1.8} />
              Rename
              <DropdownMenuShortcut>F2</DropdownMenuShortcut>
            </DropdownMenuItem>
          ) : null}
          {onMove ? (
            <DropdownMenuItem onClick={onMove}>
              <HugeiconsIcon icon={FolderExportIcon} strokeWidth={1.8} />
              Move to…
            </DropdownMenuItem>
          ) : null}
          {onDuplicate ? (
            <DropdownMenuItem onClick={onDuplicate}>
              <HugeiconsIcon icon={Copy01Icon} strokeWidth={1.8} />
              Duplicate
            </DropdownMenuItem>
          ) : null}
          {onDownload ? (
            <DropdownMenuItem onClick={onDownload}>
              <HugeiconsIcon icon={Download01Icon} strokeWidth={1.8} />
              Download
            </DropdownMenuItem>
          ) : null}
          {extras.map((x) => (
            <DropdownMenuItem key={x.id} onClick={x.onSelect}>
              {x.icon}
              {x.label}
            </DropdownMenuItem>
          ))}
          {onEditTags ? (
            <DropdownMenuItem onClick={onEditTags}>
              <HugeiconsIcon icon={HashtagIcon} strokeWidth={1.8} />
              Tags…
            </DropdownMenuItem>
          ) : null}
          {onTrash ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onClick={onTrash}>
                <HugeiconsIcon icon={Delete02Icon} strokeWidth={1.8} />
                Move to Trash
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}

// ─── Conflict banner ─────────────────────────────────────────────────

function ConflictBanner({ onReload, onDismiss }: { onReload: () => void; onDismiss: () => void }) {
  return (
    <div
      role="alert"
      data-testid="editor-conflict-banner"
      className="flex items-center gap-2 border-b border-destructive/30 bg-destructive/10 px-3 py-1.5 text-xs text-foreground"
    >
      <HugeiconsIcon
        icon={Alert02Icon}
        strokeWidth={2}
        className="size-4 shrink-0 text-destructive"
      />
      <span className="min-w-0 flex-1">
        This file was saved from another tab or device. Inkwell picked up the newer version — reload
        to see it (edits made since your last save are dropped).
      </span>
      <Button variant="outline" size="xs" onClick={onReload}>
        <HugeiconsIcon icon={RefreshIcon} strokeWidth={2} />
        Reload
      </Button>
      <Button variant="ghost" size="xs" onClick={onDismiss}>
        Dismiss
      </Button>
    </div>
  );
}

// ─── Shortcuts dialog (local until the shared one lands) ─────────────

function ShortcutsDialog({
  open,
  onOpenChange,
  owner,
  hasBack,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  owner: boolean;
  hasBack: boolean;
}) {
  const rows: Array<[string, string]> = [];
  if (hasBack) {
    rows.push([`${MOD}[`, "Back to the folder"]);
    rows.push(["Esc Esc", "Back to the folder (header focused)"]);
  }
  if (owner) rows.push(["F2", "Rename file"]);
  rows.push(["↵ / Esc", "Commit / cancel a rename"]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Editor shortcuts</DialogTitle>
          <DialogDescription>
            Each editor keeps its own shortcuts; these work across all of them.
          </DialogDescription>
        </DialogHeader>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
          {rows.map(([k, v]) => (
            <div key={k} className="contents">
              <dt>
                <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-xs">
                  {k}
                </kbd>
              </dt>
              <dd className="text-muted-foreground">{v}</dd>
            </div>
          ))}
        </dl>
      </DialogContent>
    </Dialog>
  );
}
