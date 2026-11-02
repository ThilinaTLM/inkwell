// EditorHeader — the single slim bar above every editor.
//
//   [←] Project / Folder / name   ✓ Saved   ···kind slot   [Share] ⋯
//
// Light by design: it shares the page background with the canvas
// (Excalidraw / draw.io / Markdown) and carries only a hairline.
// Left: back, muted breadcrumb, inline-editable display-font title and
// the save state. Right: the kind-specific `bridge.toolbar` slot,
// Share and the ⋯ menu (Export as…, Duplicate, Move to…, Rename, Tags…,
// Download original, Move to Trash). The shortcut sheet and account
// menu live elsewhere (⌘⇧/ and the app shell).
//
// Owner mode (`EditorPage`) vs. visitor mode (`SharedEditorPage`,
// `visitor` prop: no owner actions; "Shared · View only / Can edit"
// chip and Download / Export when the link allows it).
//
// Save state comes from the editor's own lifecycle through the
// `EditorHeaderBridge` (see `./editorHeaderBridge.ts`); every
// navigation the header triggers goes through `bridge.requestLeave` so
// the editor's leave-confirm dialog still guards unsaved work.
//
// Keyboard (⌘K / the shortcut sheet are wired by `EditorOverlays`):
//   • mod+S          save now (capture phase, preventDefault: beats
//                    Excalidraw's file dialog / the browser's Save Page)
//   • mod+shift+S    Export as…
//   • mod+shift+P    Present (whiteboards)
//   • mod+[          back (window listener, bubble phase — editors that
//                    consume the chord themselves, e.g. Excalidraw's
//                    "send backward" while editing, keep it)
//   • Esc Esc        back, only while focus is inside the header (so we
//                    never steal Esc from Excalidraw / draw.io / CodeMirror)
//   • F2             inline rename (owner, not while typing in a field)

import {
  Alert02Icon,
  ArrowLeft01Icon,
  CheckmarkCircle02Icon,
  Copy01Icon,
  Delete02Icon,
  Download01Icon,
  Edit02Icon,
  EyeIcon,
  File01Icon,
  FileExportIcon,
  FolderExportIcon,
  HashtagIcon,
  Loading03Icon,
  MoreHorizontalIcon,
  PencilEdit02Icon,
  RefreshIcon,
  Share08Icon,
  StarIcon,
  WifiDisconnected01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  type KeyboardEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { Link } from "react-router-dom";
import { FileKindGlyph } from "@/components/icons/file-kind-icons";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useMe } from "@/data/auth";
import { useFolders } from "@/data/folders";
import { folderPath } from "@/features/folders/FolderTree";
import type { FileKind } from "@/lib/api/client";
import { expiresPhrase } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ExportDialog } from "./ExportDialog";
import type { EditorHeaderBridge } from "./editorHeaderBridge";
import { isConflictMessage } from "./lifecycle/useSaveLifecycle";
import { notifySaved } from "./shared/saveFeedback";

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
  /** Link expiry (unix-ms) or `null`. */
  expiresAt?: number | null;
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
  /** Navigate to a breadcrumb folder (`null` = Inbox). Owner only. */
  onNavigateFolder?: (folderId: string | null) => void;
  /** Commit an inline rename. Resolve `false` to keep the field open. */
  onRename?: (next: string) => Promise<boolean>;
  starred?: boolean;
  onToggleStar?: () => void;
  onShare?: () => void;
  onMove?: () => void;
  onDuplicate?: () => void;
  /** Download the stored original file. */
  onDownload?: () => void;
  onEditTags?: () => void;
  onTrash?: () => void;
  /** Bump to start the inline rename from outside (palette / menus). */
  renameNonce?: number;
  /** Bump to open "Export as…" from outside (palette). */
  exportNonce?: number;
  /** Non-blocking conflict banner (another tab/device saved a newer version). */
  conflict?: { onReload: () => void; onDismiss: () => void } | null;
}

const IS_MAC = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
const MOD = IS_MAC ? "⌘" : "Ctrl+";
const SHIFT = IS_MAC ? "⇧" : "Shift+";

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
  const [exportOpen, setExportOpen] = useState(false);
  const me = useMe();

  const goBack = useCallback(() => {
    if (!onBack) return;
    bridge.requestLeave(onBack);
  }, [bridge, onBack]);

  // Live refs so the window listeners bind once.
  const goBackRef = useRef(goBack);
  goBackRef.current = goBack;
  const canRenameRef = useRef(canRename);
  canRenameRef.current = canRename;
  const bridgeRef = useRef(bridge);
  bridgeRef.current = bridge;

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

  // Save / export chords run in the capture phase so they win over
  // Excalidraw's own Ctrl+S (file dialog) and the browser's Save Page.
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.shiftKey && !e.altKey && e.code === "KeyP" && bridgeRef.current.present) {
        e.preventDefault();
        e.stopPropagation();
        bridgeRef.current.present();
        return;
      }
      if (!mod || e.altKey || e.code !== "KeyS") return;
      e.preventDefault();
      e.stopPropagation();
      if (e.shiftKey) {
        if (bridgeRef.current.exporters?.length) setExportOpen(true);
        return;
      }
      const save = bridgeRef.current.saveNow;
      if (save) void save().then((ok) => ok && notifySaved());
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
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

  // Start the inline rename / export when a nonce changes after mount
  // (a remounted header must not reopen something requested earlier).
  const { renameNonce = 0, exportNonce = 0 } = props;
  const seenNonceRef = useRef(renameNonce);
  useEffect(() => {
    if (renameNonce === seenNonceRef.current) return;
    seenNonceRef.current = renameNonce;
    if (canRenameRef.current) setRenaming(true);
  }, [renameNonce]);
  const seenExportRef = useRef(exportNonce);
  useEffect(() => {
    if (exportNonce === seenExportRef.current) return;
    seenExportRef.current = exportNonce;
    if (bridgeRef.current.exporters?.length) setExportOpen(true);
  }, [exportNonce]);

  const readOnly = isVisitor && visitor.permission !== "write";
  const exporters = bridge.exporters ?? [];

  return (
    <div className="relative z-20 shrink-0">
      <header
        role="toolbar"
        aria-label="File"
        onKeyDown={onHeaderKeyDown}
        className="flex h-12 items-center gap-1 border-b border-border/50 bg-background px-2 sm:gap-1.5 sm:px-3"
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

        <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1 text-sm">
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
            {file.kind === "file" ? (
              <HugeiconsIcon
                icon={File01Icon}
                strokeWidth={1.8}
                className="size-4 shrink-0 text-muted-foreground"
              />
            ) : (
              <FileKindGlyph kind={file.kind} className="size-4 shrink-0" />
            )}
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
                  "min-w-0 max-w-[16rem] truncate rounded-md px-1.5 py-0.5 font-display text-[15px] font-medium text-foreground sm:max-w-[28rem]",
                  "cursor-text hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
                )}
              >
                {file.name}
              </button>
            ) : (
              <span
                title={file.name}
                data-testid="editor-file-name"
                className="min-w-0 max-w-[16rem] truncate px-1.5 font-display text-[15px] font-medium text-foreground sm:max-w-[28rem]"
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
          <VisitorActions
            visitor={visitor}
            extras={bridge.menuExtras}
            onExport={exporters.length ? () => setExportOpen(true) : undefined}
          />
        ) : (
          <OwnerActions
            {...props}
            onRenameRequest={() => setRenaming(true)}
            onExportRequest={exporters.length ? () => setExportOpen(true) : undefined}
          />
        )}

        {isVisitor && !me.data && !me.isPending ? (
          <Button variant="ghost" size="sm" nativeButton={false} render={<Link to="/login" />}>
            Sign in
          </Button>
        ) : null}
      </header>

      {props.conflict ? <ConflictBanner {...props.conflict} /> : null}

      <ExportDialog
        open={exportOpen}
        onOpenChange={setExportOpen}
        fileName={file.name}
        exporters={exporters}
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
  // Collapse long paths: first › … › last two. Loose files show "Inbox".
  const shown: Array<(typeof path)[number] | null> =
    path.length > 3 ? [path[0], null, path[path.length - 2], path[path.length - 1]] : path;

  const sep = (
    <span aria-hidden className="shrink-0 text-muted-foreground/50">
      /
    </span>
  );
  const crumb =
    "hidden min-w-0 max-w-[10rem] truncate rounded-md px-1.5 py-0.5 text-muted-foreground md:inline hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40";

  return (
    <>
      {folderId === null ? (
        <>
          <button type="button" onClick={() => onNavigate(null)} className={crumb}>
            Inbox
          </button>
          <span className="hidden md:inline">{sep}</span>
        </>
      ) : null}
      {shown.map((f, i) =>
        f ? (
          <span key={f.id} className="flex min-w-0 items-center gap-1">
            <button type="button" onClick={() => onNavigate(f.id)} title={f.name} className={crumb}>
              {f.name}
            </button>
            <span className="hidden md:inline">{sep}</span>
          </span>
        ) : (
          <span
            // biome-ignore lint/suspicious/noArrayIndexKey: the ellipsis slot is positional
            key={`ellipsis-${i}`}
            className="hidden items-center gap-1 text-muted-foreground md:flex"
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
      className="h-7 min-w-0 rounded-md border border-input bg-background px-1.5 font-display text-[15px] font-medium text-foreground outline-none focus:border-ring focus:ring-2 focus:ring-ring/30"
    />
  );
}

// ─── Save indicator ──────────────────────────────────────────────────

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
      label = "Unsaved changes";
      title = `Unsaved changes — click or press ${MOD}S to save now`;
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
      label = "Saved";
      title = `All changes saved · version ${version} · ${MOD}S to save`;
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
        onClick={() => void saveNow().then((ok) => ok && notifySaved())}
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
      {visitor.expiresAt ? ` · link ${expiresPhrase(visitor.expiresAt)}` : null}
    </span>
  );
}

function VisitorActions({
  visitor,
  extras,
  onExport,
}: {
  visitor: EditorHeaderVisitor;
  extras?: EditorHeaderBridge["menuExtras"];
  onExport?: () => void;
}) {
  if (!visitor.allowDownload) return null;
  return (
    <>
      {onExport ? (
        <Button
          variant="outline"
          size="sm"
          onClick={onExport}
          title={`Export as… (${MOD}${SHIFT}S)`}
        >
          <HugeiconsIcon icon={FileExportIcon} strokeWidth={1.8} />
          <span className="hidden sm:inline">Export</span>
        </Button>
      ) : null}
      {visitor.onDownload ? (
        <Button variant="outline" size="sm" onClick={visitor.onDownload} title="Download original">
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
  onExportRequest,
}: EditorHeaderProps & { onRenameRequest: () => void; onExportRequest?: () => void }) {
  const extras = bridge.menuExtras ?? [];
  return (
    <>
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
          {onExportRequest ? (
            <DropdownMenuItem onClick={onExportRequest} data-testid="editor-export">
              <HugeiconsIcon icon={FileExportIcon} strokeWidth={1.8} />
              Export as…
              <DropdownMenuShortcut>
                {MOD}
                {SHIFT}S
              </DropdownMenuShortcut>
            </DropdownMenuItem>
          ) : null}
          {onDuplicate ? (
            <DropdownMenuItem onClick={onDuplicate}>
              <HugeiconsIcon icon={Copy01Icon} strokeWidth={1.8} />
              Duplicate
            </DropdownMenuItem>
          ) : null}
          {onMove ? (
            <DropdownMenuItem onClick={onMove}>
              <HugeiconsIcon icon={FolderExportIcon} strokeWidth={1.8} />
              Move to…
            </DropdownMenuItem>
          ) : null}
          {onRename ? (
            <DropdownMenuItem onClick={onRenameRequest}>
              <HugeiconsIcon icon={Edit02Icon} strokeWidth={1.8} />
              Rename
              <DropdownMenuShortcut>F2</DropdownMenuShortcut>
            </DropdownMenuItem>
          ) : null}
          {onEditTags ? (
            <DropdownMenuItem onClick={onEditTags}>
              <HugeiconsIcon icon={HashtagIcon} strokeWidth={1.8} />
              Tags…
            </DropdownMenuItem>
          ) : null}
          {onToggleStar ? (
            <DropdownMenuItem onClick={onToggleStar} data-testid="editor-star">
              <HugeiconsIcon
                icon={StarIcon}
                strokeWidth={1.8}
                className={cn(starred && "fill-amber-400 text-amber-500")}
              />
              {starred ? "Unstar" : "Star"}
            </DropdownMenuItem>
          ) : null}
          {extras.map((x) => (
            <DropdownMenuItem key={x.id} onClick={x.onSelect}>
              {x.icon}
              {x.label}
            </DropdownMenuItem>
          ))}
          {onDownload ? (
            <DropdownMenuItem onClick={onDownload}>
              <HugeiconsIcon icon={Download01Icon} strokeWidth={1.8} />
              Download original
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
