// Shared Excalidraw editor used by both the owner Editor page and the
// share-token SharedEditor page. The page-specific code only has to provide
// load/save/saveThumb closures and a `chrome` slot — all visible chrome
// (back/rename/share buttons, save status pill) is rendered *inside*
// Excalidraw via its native MainMenu / Footer extension points.
//
// Lifecycle:
//   1. Page calls `load()` once on mount and passes `loaded` here.
//   2. Excalidraw mounts with `initialData = loaded.blob`.
//   3. onChange → debounced save (1s) → onChange → debounced thumb (30s).
//   4. We track `version` locally and bump it after each successful save so
//      subsequent saves keep using a fresh If-Match.
//
// On a 409 we re-fetch the scene and reset state. (For a single-user instance
// this is rare; it shows up if the same scene is open in two tabs.)

import { Excalidraw, exportToSvg } from "@excalidraw/excalidraw";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type { AppState, BinaryFiles, ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import {
  Alert02Icon,
  CheckmarkCircle02Icon,
  EyeIcon,
  Loading03Icon,
  PencilEdit02Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { useDebounced } from "@/hooks/useDebounced";
import type { LoadedScene, SceneBlob } from "@/lib/api/client";
import { ApiError } from "@/lib/api/client";
import { errorMessage } from "@/lib/errors";
import { useTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";

type SaveFn = (version: number, blob: SceneBlob) => Promise<{ version: number }>;
type ThumbFn = ((svg: string) => Promise<void>) | null;

export type SaveStatus = "idle" | "dirty" | "saving" | "saved" | "error";

export interface SceneEditorProps {
  loaded: LoadedScene;
  /** Persists the scene blob. Must throw `ApiError(409)` on version conflict. */
  save: SaveFn;
  /** Persists an SVG thumbnail. Pass `null` to disable thumbnails (e.g. for shared editors). */
  saveThumb: ThumbFn;
  /** Called after each successful reload following a 409. */
  onReload?: (loaded: LoadedScene) => void;
  /** Function to re-fetch the scene from the server (used after a 409). */
  reload?: () => Promise<LoadedScene>;
  /**
   * Slot rendered as children of `<Excalidraw>` so consumers can mount native
   * Excalidraw UI (MainMenu, Sidebar). Use the `<EditorSaveBadge>` exported
   * below inside `topLeftChrome` to surface save status; it pulls from the
   * internal context so the badge stays in sync without prop drilling.
   */
  chrome?: ReactNode;
  /**
   * Rendered as an absolutely-positioned overlay anchored at top-left,
   * after Excalidraw's hamburger trigger. Use for scene-context pills
   * (back button, name). The wrapper is `pointer-events-none`; each child
   * should re-enable `pointer-events-auto` for itself so canvas
   * interactions in the surrounding area still pass through.
   */
  topLeftChrome?: ReactNode;
  /**
   * Rendered as an absolutely-positioned overlay anchored at top-right,
   * before Excalidraw's Library button. Use for scene-context pills that
   * mirror the left cluster (e.g. save status). Same pointer-events
   * contract as `topLeftChrome`.
   */
  topRightChrome?: ReactNode;
}

// ─── Internal context for status / readOnly so chrome consumers can subscribe
// without having to lift state up every time. ────────────────────────────────

interface SceneEditorContextValue {
  status: SaveStatus;
  errorMessage: string | null;
  readOnly: boolean;
}

const SceneEditorContext = createContext<SceneEditorContextValue | null>(null);

function useSceneEditorContext(): SceneEditorContextValue {
  const ctx = useContext(SceneEditorContext);
  return ctx ?? { status: "idle", errorMessage: null, readOnly: false };
}

export default function SceneEditor({
  loaded,
  save,
  saveThumb,
  onReload,
  reload,
  chrome,
  topLeftChrome,
  topRightChrome,
}: SceneEditorProps) {
  const [api, setApi] = useState<ExcalidrawImperativeAPI | null>(null);
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // App theme is the single source of truth; Excalidraw renders as a
  // controlled consumer via the `theme` prop below.
  const { resolved: themeResolved } = useTheme();

  // Mutable refs so the debounced callbacks always see the latest values
  // without re-creating themselves.
  const versionRef = useRef(loaded.meta.version);
  const inflightRef = useRef(false);
  const readOnly = loaded.permission !== "write";

  // Autosave dedup: cheap fingerprint of the meaningful scene state.
  // Excalidraw fires onChange on every cursor/selection/zoom tick, which
  // would otherwise produce a save-per-second of canvas activity even when
  // the user isn't editing. We track the fingerprint of what's on disk and
  // skip onChange / save / thumb work whenever it matches.
  //
  //  - savedFpRef:  fingerprint of the last successfully persisted blob.
  //  - thumbFpRef:  fingerprint of the last successfully uploaded thumb.
  const savedFpRef = useRef<string>(
    fingerprintScene(
      (loaded.blob.elements as ExcalidrawElement[]) || [],
      (loaded.blob.appState as Partial<AppState>) || {},
      (loaded.blob.files as BinaryFiles) || {},
    ),
  );
  const thumbFpRef = useRef<string | null>(null);

  // Reset when a *different* scene is loaded — either navigating to another
  // scene or after a 409 forces a re-fetch. We deliberately key on the
  // `loaded.blob` reference, not on `loaded.meta.version`: the parent bumps
  // `meta.version` after every successful save (while keeping the same blob
  // reference), and re-seeding `savedFpRef` from the original blob on every
  // bump would defeat dedup — every onChange would compare against a stale
  // baseline and force a redundant save, which would bump the version again,
  // and so on. The blob reference is stable across save-version bumps and
  // only changes when a fresh `LoadedScene` is set (initial mount, scene
  // navigation, post-409 reload).
  useEffect(() => {
    versionRef.current = loaded.meta.version;
    savedFpRef.current = fingerprintScene(
      (loaded.blob.elements as ExcalidrawElement[]) || [],
      (loaded.blob.appState as Partial<AppState>) || {},
      (loaded.blob.files as BinaryFiles) || {},
    );
    thumbFpRef.current = null;
    setStatus("idle");
    setErrorMsg(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
  const doSave = useCallback(
    async (elements: readonly ExcalidrawElement[], appState: AppState, files: BinaryFiles) => {
      if (readOnly) return;

      // Safety-net dedup: by the time the 1s debounce fires, the user may
      // have undone their changes back to the on-disk state. Skip the
      // round-trip in that case.
      const fp = fingerprintScene(elements, appState, files);
      if (fp === savedFpRef.current) {
        if (!inflightRef.current) setStatus("saved");
        return;
      }

      if (inflightRef.current) {
        setStatus("dirty");
        return;
      }
      inflightRef.current = true;
      setStatus("saving");
      setErrorMsg(null);

      const blob: SceneBlob = {
        elements: elements as unknown as unknown[],
        appState: pickPersistableAppState(appState, loaded.meta.name),
        files: files as unknown as Record<string, unknown>,
      };

      try {
        const res = await save(versionRef.current, blob);
        versionRef.current = res.version;
        savedFpRef.current = fp;
        setStatus("saved");
      } catch (e) {
        if (e instanceof ApiError && e.status === 409 && reload) {
          try {
            const fresh = await reload();
            versionRef.current = fresh.meta.version;
            onReload?.(fresh);
            setStatus("dirty");
            setErrorMsg("Refreshed: another tab saved a newer version.");
          } catch {
            setStatus("error");
            setErrorMsg("Conflict; reload failed.");
          }
        } else {
          setStatus("error");
          setErrorMsg(errorMessage(e, "save failed"));
        }
      } finally {
        inflightRef.current = false;
      }
    },
    [save, reload, onReload, loaded.meta.name, readOnly],
  );

  const debouncedSave = useDebounced(doSave, 1000);

  // ─── Thumbnail (debounced 30s) ──────────────────────────────────────
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
            exportBackground: true,
            viewBackgroundColor: appState.viewBackgroundColor || "#ffffff",
          } as AppState,
          files,
          exportPadding: 12,
        });
        svg.setAttribute("width", "640");
        svg.removeAttribute("height");
        await saveThumb(svg.outerHTML);
        thumbFpRef.current = fp;
      } catch {
        // Best-effort.
      }
    },
    [saveThumb, readOnly],
  );

  const debouncedThumb = useDebounced(doThumb, 30_000);

  // ─── Wire onChange ──────────────────────────────────────────────────
  const onChange = useCallback(
    (elements: readonly ExcalidrawElement[], appState: AppState, files: BinaryFiles) => {
      if (readOnly) return;
      // Primary dedup: drop noisy onChange events (cursor / selection /
      // zoom / pan / tool switch / hover) that don't change the persisted
      // scene. Without this we'd debounce a save every second of canvas
      // activity even when the user isn't editing.
      const fp = fingerprintScene(elements, appState, files);
      if (fp === savedFpRef.current) return;
      setStatus((s) => (s === "saving" ? s : "dirty"));
      debouncedSave(elements, appState, files);
      debouncedThumb(elements, appState, files);
    },
    [debouncedSave, debouncedThumb, readOnly],
  );

  // Flush pending save on unmount / page hide.
  useEffect(() => {
    const onHide = () => debouncedSave.flush();
    window.addEventListener("beforeunload", onHide);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      window.removeEventListener("beforeunload", onHide);
      document.removeEventListener("visibilitychange", onHide);
      debouncedSave.flush();
    };
  }, [debouncedSave]);

  const initial = {
    elements: (loaded.blob.elements as ExcalidrawElement[]) || [],
    appState: (loaded.blob.appState as Partial<AppState>) || {},
    files: (loaded.blob.files as BinaryFiles) || {},
  };

  return (
    <SceneEditorContext.Provider value={{ status, errorMessage: errorMsg, readOnly }}>
      <div className="relative h-full w-full">
        <div className="absolute inset-0">
          <Excalidraw
            excalidrawAPI={(a) => setApi(a)}
            initialData={initial}
            onChange={onChange}
            viewModeEnabled={readOnly}
            theme={themeResolved}
            name={loaded.meta.name}
            UIOptions={{
              canvasActions: {
                loadScene: false,
                saveToActiveFile: false,
                export: { saveFileToDisk: true },
              },
            }}
          >
            {chrome}
          </Excalidraw>
        </div>
        {topLeftChrome ? (
          // Anchored at top: 1rem (matches --editor-container-padding) and
          // left: 3.75rem (1rem padding + 2.25rem hamburger + 0.5rem gap),
          // 2.25rem tall to match Excalidraw's --lg-button-size below 1921px
          // viewports so the cluster reads as one row with the hamburger
          // trigger. z-10 sits above --zIndex-layerUI (4) but below modals
          // (1000) / popups (1001).
          <div className="pointer-events-none absolute left-[3.75rem] top-4 z-10 flex h-9 items-center gap-2">
            {topLeftChrome}
          </div>
        ) : null}
        {topRightChrome ? (
          // Anchored to clear Excalidraw's Library button (~5.5rem wide,
          // flush against the right edge) plus a 0.5rem gap matching the
          // left cluster's `gap-2`, so the right pills read as a tight
          // continuation of the Library row.
          <div className="pointer-events-none absolute right-[6.5rem] top-4 z-10 flex h-9 items-center gap-2">
            {topRightChrome}
          </div>
        ) : null}
      </div>
    </SceneEditorContext.Provider>
  );
}

// ─── Save status badge — meant to be rendered inside `topLeftChrome`
//
// Reads from SceneEditorContext so it stays in sync with the parent's save
// state without prop drilling. Styled as a paper-pill sized to match
// Excalidraw's --lg-button-size (40px) so it lines up with the hamburger
// trigger and the back/name pills next to it.
// ────────────────────────────────────────────────────────────────────────────

export function EditorSaveBadge() {
  const { status, errorMessage, readOnly } = useSceneEditorContext();

  let label = "";
  let icon: React.ReactNode = null;
  let tone = "bg-paper-elev/90 text-ink-soft";

  if (readOnly) {
    label = "Read-only";
    icon = <HugeiconsIcon icon={EyeIcon} strokeWidth={2} />;
    tone = "bg-paper-elev/90 text-ink-muted";
  } else {
    switch (status) {
      case "idle":
        label = "Ready";
        icon = <HugeiconsIcon icon={PencilEdit02Icon} strokeWidth={2} />;
        tone = "bg-paper-elev/90 text-ink-muted";
        break;
      case "dirty":
        label = "Editing";
        icon = <HugeiconsIcon icon={PencilEdit02Icon} strokeWidth={2} />;
        tone = "bg-paper-elev/90 text-ink";
        break;
      case "saving":
        label = "Saving…";
        icon = <HugeiconsIcon icon={Loading03Icon} strokeWidth={2} className="animate-spin" />;
        tone = "bg-paper-elev/90 text-ink";
        break;
      case "saved":
        label = "Saved";
        icon = <HugeiconsIcon icon={CheckmarkCircle02Icon} strokeWidth={2} />;
        tone = "bg-paper-elev/90 text-emerald-700 dark:text-emerald-300";
        break;
      case "error":
        label = errorMessage || "Save failed";
        icon = <HugeiconsIcon icon={Alert02Icon} strokeWidth={2} />;
        tone = "bg-vermillion-soft/80 text-vermillion-dark";
        break;
    }
  }

  return (
    <div
      title={errorMessage || undefined}
      className={cn(
        "pointer-events-auto inline-flex h-9 items-center gap-1.5 rounded-md px-3 text-xs font-sans font-medium ring-1 ring-ink-soft/15 backdrop-blur",
        tone,
      )}
    >
      <span className="[&_svg]:size-4">{icon}</span>
      {label}
    </div>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────────

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
