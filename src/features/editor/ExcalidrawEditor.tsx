// Shared Excalidraw editor used by both the owner Editor page and the
// share-token SharedEditor page. The page-specific code only has to
// provide load/save/saveThumb closures, a `chrome` slot for
// `<MainMenu>`, and an optional `back` affordance — all visible chrome
// is rendered *inside* Excalidraw via its native extension points:
//   • `<MainMenu>` (relocated to top-right, sibling of Library) —
//     actions, theme. Provided by the page through the `chrome` prop.
//   • `renderTopLeftUI` (patched-in slot, see
//     `patches/@excalidraw__excalidraw@0.18.1.patch`) — a
//     `<ExcalidrawTopLeftStrip>` showing back button + scene name +
//     separate save/status control. Wired internally; pages just provide
//     the `back` config (or `null` to hide).
//
// Save lifecycle (autosave + 409 retry + leave-confirm) lives in
// `./lifecycle/`; this file is the Excalidraw-specific glue:
// snapshot construction, fingerprint computation, thumb export,
// MainMenu hamburger relocation. See `useSaveLifecycle` for the
// shared contract with `DrawioEditor`.

import { Excalidraw, exportToSvg } from "@excalidraw/excalidraw";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type { AppState, BinaryFiles, ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ExcalidrawFileBlob, FileBlob, LoadedFile } from "@/lib/api/client";
import { useTheme } from "@/lib/theme";
import { ExcalidrawTopLeftStrip } from "./ExcalidrawTopLeftStrip";
import { LeaveConfirmDialog } from "./lifecycle/LeaveConfirmDialog";
import type { EditorSaveStatus } from "./lifecycle/types";
import { useLeaveConfirm } from "./lifecycle/useLeaveConfirm";
import { useSaveLifecycle } from "./lifecycle/useSaveLifecycle";
import { useThumbPipeline } from "./lifecycle/useThumbPipeline";

type SaveFn = (version: number, blob: FileBlob) => Promise<{ version: number }>;
type ThumbFn = ((svg: string) => Promise<void>) | null;
interface ExcalidrawSnapshot {
  elements: readonly ExcalidrawElement[];
  appState: AppState;
  files: BinaryFiles;
  fp: string;
}

// Re-exported so existing consumers (`ExcalidrawTopLeftStrip` and
// downstream pages) keep their imports stable. The status-name source
// of truth now lives in `./lifecycle/types`.
export type { EditorSaveStatus };

export interface ExcalidrawEditorProps {
  loaded: LoadedFile;
  /** Persists the scene blob. Must throw `ApiError(409)` on version conflict. */
  save: SaveFn;
  /** Persists an SVG thumbnail. Pass `null` to disable thumbnails (e.g. for shared editors). */
  saveThumb: ThumbFn;
  /** Called after a thumbnail upload succeeds. The page uses this to
   *  invalidate scene/folder list queries so explorer cards re-render
   *  with the new `thumbUpdatedAt` cache-bust token. */
  onThumbSaved?: () => void;
  /** Called after each successful reload following a 409. */
  onReload?: (loaded: LoadedFile) => void;
  /** Function to re-fetch the scene from the server (used after a 409). */
  reload?: () => Promise<LoadedFile>;
  /**
   * Slot rendered as children of `<Excalidraw>` so consumers can mount
   * native Excalidraw UI: `<MainMenu>` for the hamburger, optionally
   * `<Sidebar>` or `<Footer>`. The back button / scene-name / save-status
   * controls in the top-left are rendered internally via
   * `renderTopLeftUI`; pages don't need to (and shouldn't) duplicate
   * them here.
   */
  chrome?: ReactNode;
  /**
   * Optional back affordance shown on the left side of the top bar.
   * Pass `null` (or omit) to hide — e.g. on a top-level share token
   * landing where there's no parent to navigate to. The page owns the
   * navigation target because owner / shared / folder-share routes
   * each have a different "back" semantic.
   */
  back?: { onClick: () => void; label: string } | null;
  /**
   * Owner-only: opens the rename dialog. When provided, the top-left
   * strip's scene-name region becomes a double-click target. Pages
   * own the dialog itself (so they can update their working copy on
   * success) — this is just the request hook.
   */
  onRequestRename?: () => void;
}

// ─── Internal context for status / readOnly so chrome consumers can subscribe
// without having to lift state up every time. ────────────────────────────────

interface ExcalidrawEditorContextValue {
  status: EditorSaveStatus;
  errorMessage: string | null;
  readOnly: boolean;
  /** Owner-only: opens the rename dialog. `null` on read-only / shared sessions. */
  onRequestRename: (() => void) | null;
  /** Writable sessions only: triggers an immediate save of the latest scene snapshot. */
  onSaveNow: (() => void) | null;
}

const ExcalidrawEditorContext = createContext<ExcalidrawEditorContextValue | null>(null);

/**
 * Read save status / read-only state from inside a `<ExcalidrawEditor>`.
 * Returns the inert default outside the provider so consumers can be
 * mounted defensively (e.g. by Excalidraw's `renderTopLeftUI` which
 * runs inside a portal-ish render path).
 *
 * Currently only consumed by `ExcalidrawTopLeftStrip`.
 */
export function useExcalidrawEditorContext(): ExcalidrawEditorContextValue {
  const ctx = useContext(ExcalidrawEditorContext);
  return (
    ctx ?? {
      status: "saved",
      errorMessage: null,
      readOnly: false,
      onRequestRename: null,
      onSaveNow: null,
    }
  );
}

export default function ExcalidrawEditor({
  loaded,
  save,
  saveThumb,
  onThumbSaved,
  onReload,
  reload,
  chrome,
  back = null,
  onRequestRename,
}: ExcalidrawEditorProps) {
  const [api, setApi] = useState<ExcalidrawImperativeAPI | null>(null);

  // App theme is the single source of truth; Excalidraw renders as a
  // controlled consumer via the `theme` prop below.
  const { resolved: themeResolved } = useTheme();

  const initialBlob = loaded.blob as ExcalidrawFileBlob;
  const initialSnapshot = makeExcalidrawSnapshot(
    (initialBlob.elements as ExcalidrawElement[]) || [],
    ((initialBlob.appState as Partial<AppState>) || {}) as AppState,
    (initialBlob.files as BinaryFiles) || {},
  );

  // Latest snapshot pushed by Excalidraw's onChange. The lifecycle
  // hook reads this through `getLatest()` whenever it needs to
  // serialise a save.
  const latestSnapshotRef = useRef<ExcalidrawSnapshot | null>(initialSnapshot);
  const readOnly = loaded.permission !== "write";

  const fileNameRef = useRef(loaded.meta.name);
  fileNameRef.current = loaded.meta.name;

  const thumb = useThumbPipeline({ saveThumb, onThumbSaved, readOnly });

  const lifecycle = useSaveLifecycle<FileBlob, LoadedFile>({
    initialVersion: loaded.meta.version,
    initialFingerprint: initialSnapshot.fp,
    readOnly,
    transport: { save, reload },
    getLatest: () => {
      const snap = latestSnapshotRef.current;
      if (!snap) return null;
      return {
        fp: snap.fp,
        blob: {
          elements: snap.elements as unknown as unknown[],
          appState: pickPersistableAppState(snap.appState, fileNameRef.current),
          files: snap.files as unknown as Record<string, unknown>,
        },
      };
    },
    onSaved: (saved) => {
      // Schedule a thumb export after every successful save. The
      // pipeline's internal fingerprint dedup short-circuits a
      // duplicate upload when the saved content matches the last
      // shipped thumb.
      const snap = latestSnapshotRef.current;
      if (!snap) return;
      thumb.request(saved.fp, async () => {
        if (snap.elements.length === 0) return null;
        const svg = await exportToSvg({
          elements: normalizeImagesForExport(snap.elements, snap.files),
          appState: {
            ...snap.appState,
            // Transparent export: the dashboard's card body provides
            // the paper, and dark mode applies a CSS invert filter on
            // top of this SVG so dark strokes read as light strokes
            // on the dark card. Baking a white background here would
            // defeat both.
            exportBackground: false,
          } as AppState,
          files: snap.files,
          exportPadding: 12,
        });
        svg.setAttribute("width", "640");
        svg.removeAttribute("height");
        return svg.outerHTML;
      });
    },
    onReload: (fresh) => {
      onReload?.(fresh);
    },
  });

  // Reset when a *different* scene is loaded — either navigating to
  // another file or after a 409 forces a re-fetch. We deliberately key
  // on the `loaded.blob` reference, not on `loaded.meta.version`: the
  // parent bumps `meta.version` after every successful save (while
  // keeping the same blob reference), and re-seeding `savedFp` from
  // the original blob on every bump would defeat dedup — every
  // onChange would compare against a stale baseline and force a
  // redundant save, and so on. The blob reference is stable across
  // save-version bumps and only changes when a fresh `LoadedFile` is
  // set (initial mount, scene navigation, post-409 reload).
  useEffect(() => {
    const blob = loaded.blob as ExcalidrawFileBlob;
    const nextSnapshot = makeExcalidrawSnapshot(
      (blob.elements as ExcalidrawElement[]) || [],
      ((blob.appState as Partial<AppState>) || {}) as AppState,
      (blob.files as BinaryFiles) || {},
    );
    latestSnapshotRef.current = nextSnapshot;
    thumb.reset();
    lifecycle.reset(loaded.meta.version, nextSnapshot.fp);
    // `lifecycle.reset` and `thumb.reset` are stable across renders
    // (both are useCallback'd against stable refs), so depending on
    // them is harmless.
  }, [loaded.blob, loaded.meta.version, lifecycle.reset, thumb.reset]);

  // Keep Excalidraw's internal appState.name in sync with the
  // canonical scene name. Purely cosmetic: it drives Excalidraw's
  // export dialog filename and the default download filename.
  // Persistence of the scene name lives entirely on the server's
  // PATCH endpoint; the autosave PUT no longer treats appState.name
  // as canonical, so a stale appState.name here cannot revert a
  // rename.
  useEffect(() => {
    if (!api) return;
    const current = api.getAppState();
    if (current.name === loaded.meta.name) return;
    api.updateScene({
      appState: { name: loaded.meta.name } as unknown as AppState,
    });
  }, [api, loaded.meta.name]);

  // ─── Wire onChange ──────────────────────────────────────────────────
  const onChange = useCallback(
    (elements: readonly ExcalidrawElement[], appState: AppState, files: BinaryFiles) => {
      if (readOnly) return;
      latestSnapshotRef.current = makeExcalidrawSnapshot(elements, appState, files);
      lifecycle.notifyChange();
    },
    [readOnly, lifecycle],
  );

  // ─── In-app navigation guard ────────────────────────────────────────
  const leave = useLeaveConfirm({
    isDirty: lifecycle.isDirty,
    saveNow: lifecycle.saveNow,
    discardPendingLocalWork: lifecycle.discardPendingLocalWork,
  });
  const requestBack = useCallback(() => {
    if (!back) return;
    leave.requestLeave(back.onClick);
  }, [back, leave]);

  // The strip's back button calls `requestBack`, not `back.onClick`
  // directly. Memoised so `renderTopLeftUI`'s deps stay shallow — a
  // fresh object literal each render would re-create the
  // `renderTopLeftUI` callback on every status tick.
  const guardedBack = useMemo(
    () => (back ? { onClick: requestBack, label: back.label } : null),
    [back, requestBack],
  );

  const currentBlob = loaded.blob as ExcalidrawFileBlob;
  const initial = {
    elements: (currentBlob.elements as ExcalidrawElement[]) || [],
    appState: (currentBlob.appState as Partial<AppState>) || {},
    files: (currentBlob.files as BinaryFiles) || {},
  };

  // `renderTopLeftUI` is invoked by Excalidraw on every render. We
  // declare it inline so it closes over the latest `loaded.meta.name`
  // / `back`; the strip itself reads save state from
  // `ExcalidrawEditorContext` so the closure dependencies stay
  // shallow.
  //
  // Slot is added by our pnpm patch on `@excalidraw/excalidraw`; see
  // the file header. On desktop the slot is invoked once and
  // `position` is `undefined` (the strip renders the full
  // back+name+status row). On mobile the patched `MobileMenu` invokes
  // the slot twice with `position="before"` / `"after"` so we can
  // flank the relocated MainMenu hamburger inside the bottom toolbar;
  // the strip splits itself accordingly.
  const renderTopLeftUI = useCallback(
    (isMobile: boolean, _appState: unknown, position?: "before" | "after") => (
      <ExcalidrawTopLeftStrip
        name={loaded.meta.name}
        back={guardedBack}
        isMobile={isMobile}
        position={position}
      />
    ),
    [loaded.meta.name, guardedBack],
  );

  return (
    <ExcalidrawEditorContext.Provider
      value={{
        status: lifecycle.status,
        errorMessage: lifecycle.errorMessage,
        readOnly,
        onRequestRename: !readOnly && onRequestRename ? onRequestRename : null,
        onSaveNow: !readOnly ? () => void lifecycle.saveNow() : null,
      }}
    >
      <div className="relative h-full w-full">
        <div className="absolute inset-0">
          <Excalidraw
            excalidrawAPI={(a) => setApi(a)}
            initialData={initial}
            onChange={onChange}
            viewModeEnabled={readOnly}
            theme={themeResolved}
            name={loaded.meta.name}
            renderTopLeftUI={renderTopLeftUI}
            UIOptions={{
              canvasActions: {
                loadScene: false,
                saveToActiveFile: false,
                export: { saveFileToDisk: true },
                // Excalidraw auto-disables its built-in `toggleTheme`
                // action when the host passes a controlled `theme`
                // prop (we do, so light/dark stays in sync with the
                // rest of the app). The auto-disable also makes
                // `MainMenu.DefaultItems.ToggleTheme` render as null,
                // which would silently drop our menu entry. Opting
                // back in keeps the default item visible — we still
                // own the actual theme state via `onSelect` /
                // `useTheme` (the `theme` prop wins over the action).
                toggleTheme: true,
              },
            }}
          >
            {chrome}
          </Excalidraw>
        </div>
      </div>
      <LeaveConfirmDialog
        open={leave.open}
        busy={leave.busy}
        onOpenChange={leave.onOpenChange}
        onDiscard={leave.discard}
        onSaveAndLeave={() => void leave.saveAndLeave()}
      />
    </ExcalidrawEditorContext.Provider>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeExcalidrawSnapshot(
  elements: readonly ExcalidrawElement[],
  appState: AppState,
  files: BinaryFiles,
): ExcalidrawSnapshot {
  return {
    elements,
    appState,
    files,
    fp: fingerprintScene(elements, appState, files),
  };
}

// Cheap O(n) fingerprint of the meaningful scene state — used to dedup
// autosaves so cursor/selection/zoom/pan ticks don't trigger network I/O.
//
// Element-side signal: Excalidraw bumps `element.version` on any real
// mutation (create, move, resize, text edit, style, z-order, delete) and
// leaves it alone for transient UI state. So a rolling hash of per-element
// versions captures "did the document change" without serialising element
// bodies.
//
// AppState-side signal: a whitelist of persisted-relevant fields. Covers
// (a) document settings (background, grid, theme, name, zen/snap modes)
// and (b) the `currentItem*` style memory — colors / fonts / stroke /
// arrowheads / roundness — because changing those is a real user action
// that doesn't bump any element version. Anything not on this list
// (cursor coords, selection, zoom, scrollX/Y, active tool, hover state,
// editing flags, etc.) is intentionally ignored.
//
// File-side signal: sorted file-key list (catches added/removed images;
// content edits to an existing image change the fileId, hence the key).
function fingerprintScene(
  elements: readonly ExcalidrawElement[],
  appState: Partial<AppState>,
  files: BinaryFiles,
): string {
  let elemHash = elements.length | 0;
  for (let i = 0; i < elements.length; i++) {
    const v = ((elements[i] as { version?: number }).version ?? 0) | 0;
    elemHash = (elemHash * 31 + v) | 0;
  }
  const a = appState as Partial<AppState> & Record<string, unknown>;
  const appPart = [
    a.viewBackgroundColor ?? "",
    a.gridModeEnabled ? 1 : 0,
    a.gridSize ?? "",
    // Theme is an app-level preference (see src/lib/theme.tsx) and is
    // controlled via Excalidraw's `theme` prop, so it's intentionally
    // not part of the dirty fingerprint and is stripped from the
    // persisted blob in pickPersistableAppState.
    a.name ?? "",
    a.zenModeEnabled ? 1 : 0,
    a.objectsSnapModeEnabled ? 1 : 0,
    // Current-item style memory — user-chosen defaults for the next shape.
    a.currentItemStrokeColor ?? "",
    a.currentItemBackgroundColor ?? "",
    a.currentItemFillStyle ?? "",
    a.currentItemStrokeWidth ?? "",
    a.currentItemStrokeStyle ?? "",
    a.currentItemRoughness ?? "",
    a.currentItemOpacity ?? "",
    a.currentItemFontFamily ?? "",
    a.currentItemFontSize ?? "",
    a.currentItemTextAlign ?? "",
    a.currentItemStartArrowhead ?? "",
    a.currentItemEndArrowhead ?? "",
    a.currentItemRoundness ?? "",
    a.currentItemArrowType ?? "",
  ].join("|");
  const fileKeys = Object.keys(files);
  const filePart = fileKeys.length === 0 ? "" : fileKeys.sort().join(",");
  return `${elemHash}|${appPart}|${filePart}`;
}

// Strip transient appState that isn't meaningful to persist.
function pickPersistableAppState(
  appState: AppState,
  fallbackName: string,
): Record<string, unknown> {
  const {
    collaborators: _c,
    cursorButton: _cb,
    isLoading: _il,
    errorMessage: _em,
    draggingElement: _de,
    editingElement: _ee,
    selectionElement: _se,
    multiElement: _me,
    suggestedBindings: _sb,
    pendingImageElementId: _pi,
    contextMenu: _cm,
    showHyperlinkPopup: _hp,
    snapLines: _sl,
    originSnapOffset: _osn,
    // Theme is owned app-side now; don't persist it on the blob.
    theme: _t,
    ...rest
  } = appState as unknown as Record<string, unknown>;
  return { ...rest, name: (rest.name as string | undefined) || fallbackName };
}

// Excalidraw won't render embedded images during export until their `status`
// flips to "saved". Patch a copy before exporting the thumbnail. (Pattern
// borrowed from ExcaliDash.)
function normalizeImagesForExport(
  elements: readonly ExcalidrawElement[],
  files: BinaryFiles,
): ExcalidrawElement[] {
  return elements.map((el) => {
    if (el.type !== "image" || typeof el.fileId !== "string") return el;
    const file = files[el.fileId as keyof typeof files] as { dataURL?: string } | undefined;
    const hasData = !!file?.dataURL?.startsWith?.("data:image/");
    if (!hasData || (el as { status?: string }).status === "saved") return el;
    return { ...el, status: "saved" } as ExcalidrawElement;
  });
}
