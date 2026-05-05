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
// The MainMenu hamburger lives on the top-right because our patch
// moves the `MainMenuTunnel.Out` from `.App-menu_top__left` (left
// column) to inside `.layer-ui__wrapper__top-right`. The `chrome`
// children of `<Excalidraw>` are unchanged; only the trigger's DOM
// position is.
//
// Lifecycle:
//   1. Page calls `load()` once on mount and passes `loaded` here.
//   2. Excalidraw mounts with `initialData = loaded.blob`.
//   3. onChange stores the latest meaningful snapshot, schedules a
//      debounced scene save (30s), and schedules a debounced thumb (8s).
//   4. Manual save and Save & Leave both bypass the 30s debounce and
//      persist the latest queued snapshot immediately.
//   5. We track `version` locally and bump it after each successful save
//      so subsequent saves keep using a fresh If-Match.
//
// On a 409 we re-fetch the scene and reset state. (For a single-user instance
// this is rare; it shows up if the same scene is open in two tabs.)
//
// Unsaved-changes guard: while save state is dirty/saving/error and the
// session is writable, the top-left back button shows our own
// Stay / Discard / Save & Leave dialog. Tab close / hard reload still
// use the native browser prompt via `beforeunload`; browsers do not allow
// a custom 3-button dialog there. Read-only sessions bypass the guard.

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
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { useDebounced } from "@/hooks/useDebounced";
import type { ExcalidrawFileBlob, FileBlob, LoadedFile } from "@/lib/api/client";
import { ApiError } from "@/lib/api/client";
import { errorMessage } from "@/lib/errors";
import { useTheme } from "@/lib/theme";
import { ExcalidrawTopLeftStrip } from "./ExcalidrawTopLeftStrip";

type SaveFn = (version: number, blob: FileBlob) => Promise<{ version: number }>;
type ThumbFn = ((svg: string) => Promise<void>) | null;
interface ExcalidrawSnapshot {
  elements: readonly ExcalidrawElement[];
  appState: AppState;
  files: BinaryFiles;
  fp: string;
}

// Editor save lifecycle. "saved" is the resting state — both the
// initial value (a freshly loaded scene matches the server) and the
// state after a successful autosave. "dirty" / "saving" / "error"
// are the transient in-edit states.
export type EditorSaveStatus = "dirty" | "saving" | "saved" | "error";

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
  // A freshly loaded scene matches the server by construction, so the
  // initial state is "saved", not "idle". "idle" would surface the
  // pencil "Ready" indicator on first paint and only flip to a
  // checkmark after the user makes (and we persist) an edit —
  // misleading, since the scene already is saved on disk.
  const [status, setStatus] = useState<EditorSaveStatus>("saved");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // App theme is the single source of truth; Excalidraw renders as a
  // controlled consumer via the `theme` prop below.
  const { resolved: themeResolved } = useTheme();

  // Mutable refs so the debounced callbacks always see the latest values
  // without re-creating themselves.
  const versionRef = useRef(loaded.meta.version);
  const inflightRef = useRef(false);
  const inflightSnapshotRef = useRef<ExcalidrawSnapshot | null>(null);
  const saveQueuedRef = useRef(false);
  const savePromiseRef = useRef<Promise<boolean> | null>(null);
  const initialBlob = loaded.blob as ExcalidrawFileBlob;
  const initialSnapshot = makeExcalidrawSnapshot(
    (initialBlob.elements as ExcalidrawElement[]) || [],
    ((initialBlob.appState as Partial<AppState>) || {}) as AppState,
    (initialBlob.files as BinaryFiles) || {},
  );
  const latestSnapshotRef = useRef<ExcalidrawSnapshot | null>(initialSnapshot);
  const readOnly = loaded.permission !== "write";

  // Autosave dedup: cheap fingerprint of the meaningful scene state.
  // Excalidraw fires onChange on every cursor/selection/zoom tick, which
  // would otherwise produce a save-per-second of canvas activity even when
  // the user isn't editing. We track the fingerprint of what's on disk and
  // skip onChange / save / thumb work whenever it matches.
  //
  //  - savedFpRef:  fingerprint of the last successfully persisted blob.
  //  - thumbFpRef:  fingerprint of the last successfully uploaded thumb.
  const savedFpRef = useRef<string>(initialSnapshot.fp);
  const thumbFpRef = useRef<string | null>(null);

  // Reset when a *different* scene is loaded — either navigating to another
  // scene or after a 409 forces a re-fetch. We deliberately key on the
  // `loaded.blob` reference, not on `loaded.meta.version`: the parent bumps
  // `meta.version` after every successful save (while keeping the same blob
  // reference), and re-seeding `savedFpRef` from the original blob on every
  // bump would defeat dedup — every onChange would compare against a stale
  // baseline and force a redundant save, which would bump the version again,
  // and so on. The blob reference is stable across save-version bumps and
  // only changes when a fresh `LoadedFile` is set (initial mount, scene
  // navigation, post-409 reload).
  useEffect(() => {
    versionRef.current = loaded.meta.version;
  }, [loaded.meta.version]);

  useEffect(() => {
    const blob = loaded.blob as ExcalidrawFileBlob;
    const nextSnapshot = makeExcalidrawSnapshot(
      (blob.elements as ExcalidrawElement[]) || [],
      ((blob.appState as Partial<AppState>) || {}) as AppState,
      (blob.files as BinaryFiles) || {},
    );
    latestSnapshotRef.current = nextSnapshot;
    inflightSnapshotRef.current = null;
    saveQueuedRef.current = false;
    savePromiseRef.current = null;
    savedFpRef.current = nextSnapshot.fp;
    thumbFpRef.current = null;
    // See note on the initial status: a fresh blob === server state.
    setStatus("saved");
    setErrorMsg(null);
  }, [loaded.blob]);

  // Keep Excalidraw's internal appState.name in sync with the canonical
  // scene name. This is purely cosmetic: it drives Excalidraw's export
  // dialog filename and the default download filename. Persistence of
  // the scene name lives entirely on the server's PATCH endpoint; the
  // autosave PUT no longer treats appState.name as canonical, so a
  // stale appState.name here cannot revert a rename.
  useEffect(() => {
    if (!api) return;
    const current = api.getAppState();
    if (current.name === loaded.meta.name) return;
    // Cast: Excalidraw's `updateScene.appState` typing wants a strict
    // `Pick<AppState, ...>` but in practice accepts a partial patch.
    api.updateScene({
      appState: { name: loaded.meta.name } as unknown as AppState,
    });
  }, [api, loaded.meta.name]);

  // ─── Persist scene ──────────────────────────────────────────────────
  const saveLatest = useCallback(async (): Promise<boolean> => {
    if (readOnly) return true;

    if (inflightRef.current) {
      saveQueuedRef.current = true;
      return savePromiseRef.current ?? Promise.resolve(false);
    }

    const task = (async () => {
      inflightRef.current = true;
      try {
        while (true) {
          const snapshot = latestSnapshotRef.current;
          if (!snapshot || snapshot.fp === savedFpRef.current) {
            saveQueuedRef.current = false;
            setStatus("saved");
            setErrorMsg(null);
            return true;
          }

          inflightSnapshotRef.current = snapshot;
          setStatus("saving");
          setErrorMsg(null);

          const blob: FileBlob = {
            elements: snapshot.elements as unknown as unknown[],
            appState: pickPersistableAppState(snapshot.appState, loaded.meta.name),
            files: snapshot.files as unknown as Record<string, unknown>,
          };

          try {
            const res = await save(versionRef.current, blob);
            versionRef.current = res.version;
            savedFpRef.current = snapshot.fp;
          } catch (e) {
            if (e instanceof ApiError && e.status === 409 && reload) {
              try {
                const fresh = await reload();
                versionRef.current = fresh.meta.version;
                onReload?.(fresh);
                setStatus("error");
                setErrorMsg("Refreshed: another tab saved a newer version.");
              } catch {
                setStatus("error");
                setErrorMsg("Conflict; reload failed.");
              }
            } else {
              setStatus("error");
              setErrorMsg(errorMessage(e, "save failed"));
            }
            saveQueuedRef.current = false;
            return false;
          } finally {
            inflightSnapshotRef.current = null;
          }

          if (latestSnapshotRef.current?.fp === savedFpRef.current) {
            saveQueuedRef.current = false;
            setStatus("saved");
            setErrorMsg(null);
            return true;
          }

          // A newer local snapshot arrived while the last PUT was in-flight.
          // Loop and persist the newest one immediately.
          saveQueuedRef.current = false;
        }
      } finally {
        inflightRef.current = false;
        inflightSnapshotRef.current = null;
        savePromiseRef.current = null;
      }
    })();

    savePromiseRef.current = task;
    return task;
  }, [save, reload, onReload, loaded.meta.name, readOnly]);

  const debouncedSave = useDebounced(() => {
    void saveLatest();
  }, 30_000);

  // ─── Thumbnail (debounced 8s) ───────────────────────────────────────
  const doThumb = useCallback(
    async (elements: readonly ExcalidrawElement[], appState: AppState, files: BinaryFiles) => {
      if (!saveThumb || readOnly) return;
      if (elements.length === 0) return;

      // Skip the SVG export + upload if the scene hasn't meaningfully
      // changed since the last successful thumb.
      const fp = fingerprintScene(elements, appState, files);
      if (fp === thumbFpRef.current) return;

      try {
        const svg = await exportToSvg({
          elements: normalizeImagesForExport(elements, files),
          appState: {
            ...appState,
            // Transparent export: the dashboard's card body provides the
            // paper, and dark mode applies a CSS invert filter on top of
            // this SVG so dark strokes read as light strokes on the dark
            // card. Baking a white background here would defeat both.
            exportBackground: false,
          } as AppState,
          files,
          exportPadding: 12,
        });
        svg.setAttribute("width", "640");
        svg.removeAttribute("height");
        await saveThumb(svg.outerHTML);
        thumbFpRef.current = fp;
        // Tell the page so it can invalidate scene/folder list queries.
        // Done after `thumbFpRef` so a duplicate fingerprint check
        // short-circuits the next call.
        onThumbSaved?.();
      } catch {
        // Best-effort.
      }
    },
    [saveThumb, readOnly, onThumbSaved],
  );

  // 8s debounce: long enough to coalesce an editing burst, short enough
  // that returning to the dashboard within ~10s shows the fresh thumb.
  const debouncedThumb = useDebounced(doThumb, 8_000);

  const saveNow = useCallback(async (): Promise<boolean> => {
    if (readOnly) return true;
    debouncedSave.cancel();
    const ok = await saveLatest();
    if (ok) debouncedThumb.flush();
    return ok;
  }, [debouncedSave, debouncedThumb, saveLatest, readOnly]);

  const discardPendingLocalWork = useCallback(() => {
    debouncedSave.cancel();
    debouncedThumb.cancel();
    saveQueuedRef.current = false;
    latestSnapshotRef.current = inflightRef.current ? inflightSnapshotRef.current : null;
    if (!inflightRef.current) {
      setStatus("saved");
      setErrorMsg(null);
    }
  }, [debouncedSave, debouncedThumb]);

  // ─── Wire onChange ──────────────────────────────────────────────────
  const onChange = useCallback(
    (elements: readonly ExcalidrawElement[], appState: AppState, files: BinaryFiles) => {
      if (readOnly) return;

      const snapshot = makeExcalidrawSnapshot(elements, appState, files);
      latestSnapshotRef.current = snapshot;

      // Primary dedup: drop noisy onChange events (cursor / selection /
      // zoom / pan / tool switch / hover) that don't change the persisted
      // scene. Without this we'd debounce a save every 30s of canvas
      // activity even when the user isn't editing.
      if (snapshot.fp === savedFpRef.current) {
        if (inflightRef.current) {
          saveQueuedRef.current = true;
          debouncedThumb(snapshot.elements, snapshot.appState, snapshot.files);
        } else {
          saveQueuedRef.current = false;
          debouncedSave.cancel();
          debouncedThumb.cancel();
          setStatus("saved");
          setErrorMsg(null);
        }
        return;
      }

      if (inflightRef.current) saveQueuedRef.current = true;
      setStatus((s) => (s === "saving" ? s : "dirty"));
      setErrorMsg(null);
      debouncedSave();
      debouncedThumb(snapshot.elements, snapshot.appState, snapshot.files);
    },
    [debouncedSave, debouncedThumb, readOnly],
  );

  // Flush pending save AND thumb on unmount / page hide. Without this,
  // a user who edits and navigates back to the dashboard within the 8s
  // thumb-debounce window would see no preview — `useDebounced` cancels
  // the pending call on unmount, dropping the upload entirely.
  //
  // `flush()` synchronously invokes the wrapped function, which kicks
  // off `exportToSvg` + `saveThumb` (a fetch). The fetch completes in
  // the background after this component unmounts — React Query's
  // `qc.invalidateQueries` from `onThumbSaved` still works because the
  // QueryClient is mounted at the app root, not here. On true
  // `beforeunload` (tab close) the fetch may be killed mid-flight; that's
  // the same risk as `debouncedSave` and we accept it.
  //
  // While unsaved (`isDirty`), `beforeunload` also fires the native
  // browser prompt so the user can cancel a tab close / hard reload
  // before their pending edits are lost. We read the live value through
  // a ref so the listener doesn't have to re-bind on every status tick.
  const isDirty = !readOnly && (status === "dirty" || status === "saving" || status === "error");
  const isDirtyRef = useRef(isDirty);
  useEffect(() => {
    isDirtyRef.current = isDirty;
  }, [isDirty]);
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      debouncedSave.flush();
      debouncedThumb.flush();
      if (isDirtyRef.current) {
        e.preventDefault();
        // Modern browsers ignore the string but require `returnValue` to
        // be set to anything to trigger their built-in prompt.
        e.returnValue = "";
      }
    };
    const onVisibility = () => {
      debouncedSave.flush();
      debouncedThumb.flush();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("visibilitychange", onVisibility);
      debouncedSave.flush();
      debouncedThumb.flush();
    };
  }, [debouncedSave, debouncedThumb]);

  // In-app navigation guard. The app uses `<BrowserRouter>` rather
  // than a data router, so `useBlocker` isn't available; instead we
  // wrap the only in-app exit path from the editor — the top-left
  // back button — to surface a confirm dialog. `pendingBackRef` holds
  // the awaited continuation between "the user clicked back" and
  // "the user picked an action in the dialog".
  const [confirmLeaveOpen, setConfirmLeaveOpen] = useState(false);
  const [leaveBusy, setLeaveBusy] = useState<false | "save">(false);
  const pendingBackRef = useRef<(() => void) | null>(null);
  const requestBack = useCallback(() => {
    if (!back) return;
    if (!isDirty) {
      back.onClick();
      return;
    }
    pendingBackRef.current = back.onClick;
    setConfirmLeaveOpen(true);
  }, [back, isDirty]);
  const cancelLeave = useCallback(() => {
    if (leaveBusy) return;
    pendingBackRef.current = null;
    setConfirmLeaveOpen(false);
  }, [leaveBusy]);
  const discardAndLeave = useCallback(() => {
    discardPendingLocalWork();
    setLeaveBusy(false);
    setConfirmLeaveOpen(false);
    const cont = pendingBackRef.current;
    pendingBackRef.current = null;
    cont?.();
  }, [discardPendingLocalWork]);
  const saveAndLeave = useCallback(async () => {
    setLeaveBusy("save");
    const ok = await saveNow();
    if (!ok) {
      setLeaveBusy(false);
      return;
    }
    setLeaveBusy(false);
    setConfirmLeaveOpen(false);
    const cont = pendingBackRef.current;
    pendingBackRef.current = null;
    cont?.();
  }, [saveNow]);

  // The strip's back button calls `requestBack`, not `back.onClick`
  // directly. Memoised so `renderTopLeftUI`'s deps stay shallow —
  // a fresh object literal each render would re-create the
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
  // `ExcalidrawEditorContext` so the closure dependencies stay shallow.
  //
  // Slot is added by our pnpm patch on `@excalidraw/excalidraw`; see
  // the file header. On desktop the slot is invoked once and `position`
  // is `undefined` (the strip renders the full back+name+status row).
  // On mobile the patched `MobileMenu` invokes the slot twice with
  // `position="before"` / `"after"` so we can flank the relocated
  // MainMenu hamburger inside the bottom toolbar; the strip splits
  // itself accordingly.
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
        status,
        errorMessage: errorMsg,
        readOnly,
        onRequestRename: !readOnly && onRequestRename ? onRequestRename : null,
        onSaveNow: !readOnly ? () => void saveNow() : null,
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
      <AlertDialog
        open={confirmLeaveOpen}
        onOpenChange={(open) => {
          if (!open && !leaveBusy) cancelLeave();
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Leave with unsaved changes?</AlertDialogTitle>
            <AlertDialogDescription>
              Your latest edits haven't been saved yet. If you leave now they may be lost.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={!!leaveBusy}>Stay</AlertDialogCancel>
            <Button variant="destructive" onClick={discardAndLeave} disabled={!!leaveBusy}>
              Discard
            </Button>
            <Button onClick={() => void saveAndLeave()} disabled={!!leaveBusy}>
              {leaveBusy ? "Saving…" : "Save & Leave"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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
