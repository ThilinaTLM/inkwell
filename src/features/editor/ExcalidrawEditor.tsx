// Shared Excalidraw editor used by both the owner Editor page and the
// share-token SharedEditor page. The page-specific code provides
// load/save/saveThumb closures, a `chrome` slot for `<MainMenu>` and a
// `renderHeader` callback:
//   • `renderHeader(bridge)` — the page's `<EditorHeader>` (back,
//     breadcrumb, name, save state, actions), rendered above the canvas.
//     The bridge carries the live save status and the leave-confirm
//     guard so header navigation can't drop unsaved work.
//   • `<MainMenu>` (relocated to top-right, sibling of Library, by our
//     Excalidraw patch) — canvas-level items only (theme, export image,
//     help). File-level actions live in the header.
//
// Save lifecycle (autosave + 409 retry + leave-confirm) lives in
// `./lifecycle/`; this file is the Excalidraw-specific glue:
// snapshot construction, fingerprint computation, thumb export.
// See `useSaveLifecycle` for the shared contract with `DrawioEditor`.

import {
  Excalidraw,
  exportToBlob,
  exportToSvg,
  restore,
  serializeAsJSON,
} from "@excalidraw/excalidraw";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type { AppState, BinaryFiles, ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { PlayIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { type ReactNode, useCallback, useEffect, useMemo, useRef } from "react";
import { Button } from "@/components/ui/button";
import type { ExcalidrawFileBlob, FileBlob, LoadedFile } from "@/lib/api/client";
import { useTheme } from "@/lib/theme";
import { usePresentation } from "./ExcalidrawPresent";
import type { EditorExporter, EditorHeaderBridge, RenderEditorHeader } from "./editorHeaderBridge";
import { fingerprintScene, pickPersistableAppState } from "./excalidrawScene";
import { renderExcalidrawThumbSvg } from "./excalidrawThumb";
import { LeaveConfirmDialog } from "./lifecycle/LeaveConfirmDialog";
import type { EditorSaveStatus } from "./lifecycle/types";
import { useLeaveConfirm } from "./lifecycle/useLeaveConfirm";
import { useSaveLifecycle } from "./lifecycle/useSaveLifecycle";
import { useThumbPipeline } from "./lifecycle/useThumbPipeline";
import { downloadBlob, downloadText, exportBaseName } from "./shared/exportFile";

const IS_MAC = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

type SaveFn = (version: number, blob: FileBlob) => Promise<{ version: number }>;
type ThumbFn = ((svg: string) => Promise<void>) | null;
interface ExcalidrawSnapshot {
  elements: readonly ExcalidrawElement[];
  appState: AppState;
  files: BinaryFiles;
  fp: string;
}

// Re-exported for downstream consumers. The status-name source of
// truth lives in `./lifecycle/types`.
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
   * `<Sidebar>` or `<Footer>`.
   */
  chrome?: ReactNode;
  /** Renders the page header above the canvas (see `EditorHeader`). */
  renderHeader?: RenderEditorHeader;
}

export default function ExcalidrawEditor({
  loaded,
  save,
  saveThumb,
  onThumbSaved,
  onReload,
  reload,
  chrome,
  renderHeader,
}: ExcalidrawEditorProps) {
  // Excalidraw invokes this callback synchronously from its class constructor.
  // Keeping the API in state would update this parent while its child is still
  // rendering. React 19 retries that render and can enter a maximum-depth loop.
  // A ref is sufficient: the API is assigned before this component's effects run.
  const apiRef = useRef<ExcalidrawImperativeAPI | null>(null);
  const receiveApi = useCallback((api: ExcalidrawImperativeAPI) => {
    apiRef.current = api;
  }, []);

  const presentation = usePresentation(apiRef);
  const presentingRef = useRef(false);
  presentingRef.current = presentation.presenting;

  // App theme is the single source of truth; Excalidraw renders as a
  // controlled consumer via the `theme` prop below.
  const { resolved: themeResolved } = useTheme();

  const initialSnapshot = useMemo(
    () => normalizedSnapshot(loaded.blob as ExcalidrawFileBlob),
    [loaded.blob],
  );
  // The first `onChange` after (re)mount carries Excalidraw's own
  // normalised scene. It becomes the saved baseline (see `onChange`)
  // so an untouched file never shows as edited or bumps its version.
  const baselinedRef = useRef(false);

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
        return renderExcalidrawThumbSvg(snap.elements, snap.appState, snap.files);
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
    const nextSnapshot = normalizedSnapshot(loaded.blob as ExcalidrawFileBlob);
    baselinedRef.current = false;
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
    const api = apiRef.current;
    if (!api) return;
    const current = api.getAppState();
    if (current.name === loaded.meta.name) return;
    api.updateScene({
      appState: { name: loaded.meta.name } as unknown as AppState,
    });
  }, [loaded.meta.name]);

  // ─── Wire onChange ──────────────────────────────────────────────────
  const onChange = useCallback(
    (elements: readonly ExcalidrawElement[], appState: AppState, files: BinaryFiles) => {
      // Present mode is view-only: nothing it does may reach the save loop.
      if (readOnly || presentingRef.current) return;
      const snap = makeExcalidrawSnapshot(elements, appState, files);
      latestSnapshotRef.current = snap;
      if (!baselinedRef.current) {
        baselinedRef.current = true;
        // Adopt Excalidraw's normalised scene as "what the server has".
        lifecycle.reset(loaded.meta.version, snap.fp);
        return;
      }
      lifecycle.notifyChange();
    },
    [readOnly, lifecycle, loaded.meta.version],
  );

  // ─── In-app navigation guard ────────────────────────────────────────
  const leave = useLeaveConfirm({
    isDirty: lifecycle.isDirty,
    saveNow: lifecycle.saveNow,
    discardPendingLocalWork: lifecycle.discardPendingLocalWork,
  });

  const currentBlob = loaded.blob as ExcalidrawFileBlob;
  const initial = {
    elements: (currentBlob.elements as ExcalidrawElement[]) || [],
    appState: (currentBlob.appState as Partial<AppState>) || {},
    files: (currentBlob.files as BinaryFiles) || {},
    // Fit the drawing into view on open instead of restoring a stale pan/zoom.
    scrollToContent: true,
  };

  const { saveNow, discardPendingLocalWork } = lifecycle;
  const { requestLeave } = leave;
  const fileName = loaded.meta.name;
  const exporters = useMemo<EditorExporter[]>(() => {
    const scene = () => {
      const api = apiRef.current;
      if (!api) throw new Error("The canvas is not ready yet");
      return {
        api,
        elements: api.getSceneElements(),
        appState: api.getAppState(),
        files: api.getFiles(),
      };
    };
    // Images are always rendered on a light canvas regardless of the
    // app theme, so exports are shareable anywhere.
    const imageState = (appState: AppState) => ({
      ...appState,
      exportBackground: true,
      exportWithDarkMode: false,
      exportScale: 2,
    });
    const base = exportBaseName(fileName);
    return [
      {
        id: "excalidraw",
        label: ".excalidraw",
        hint: "Editable scene — reopen it in Excalidraw or re-upload to Inkwell.",
        run: () => {
          const { api, appState, files } = scene();
          downloadText(
            serializeAsJSON(api.getSceneElementsIncludingDeleted(), appState, files, "local"),
            `${base}.excalidraw`,
            "application/json",
          );
        },
      },
      {
        id: "png",
        label: "PNG",
        hint: "Image at 2× resolution on a light background.",
        run: async () => {
          const { elements, appState, files } = scene();
          if (elements.length === 0) throw new Error("Nothing to export — the canvas is empty");
          const blob = await exportToBlob({
            elements,
            appState: imageState(appState),
            files,
            mimeType: "image/png",
            exportPadding: 24,
          });
          downloadBlob(blob, `${base}.png`);
        },
      },
      {
        id: "svg",
        label: "SVG",
        hint: "Vector image on a light background.",
        run: async () => {
          const { elements, appState, files } = scene();
          if (elements.length === 0) throw new Error("Nothing to export — the canvas is empty");
          const svg = await exportToSvg({
            elements,
            appState: imageState(appState),
            files,
            exportPadding: 24,
          });
          downloadText(new XMLSerializer().serializeToString(svg), `${base}.svg`, "image/svg+xml");
        },
      },
    ];
  }, [fileName]);
  const bridge = useMemo<EditorHeaderBridge>(
    () => ({
      status: readOnly ? null : lifecycle.status,
      errorMessage: lifecycle.errorMessage,
      saveNow: readOnly ? null : saveNow,
      flush: saveNow,
      discard: discardPendingLocalWork,
      requestLeave,
      exporters,
      present: presentation.start,
      toolbar: (
        <Button
          variant="ghost"
          size="sm"
          onClick={presentation.start}
          title={`Present (${IS_MAC ? "⌘⇧P" : "Ctrl+Shift+P"})`}
          data-testid="editor-present"
        >
          <HugeiconsIcon icon={PlayIcon} strokeWidth={1.8} />
          <span className="hidden sm:inline">Present</span>
        </Button>
      ),
    }),
    [
      presentation.start,
      exporters,
      readOnly,
      lifecycle.status,
      lifecycle.errorMessage,
      saveNow,
      discardPendingLocalWork,
      requestLeave,
    ],
  );

  return (
    <div className="flex h-full w-full flex-col">
      {presentation.presenting ? null : renderHeader?.(bridge)}
      <div className="relative min-h-0 w-full flex-1">
        <div className="absolute inset-0">
          <Excalidraw
            excalidrawAPI={receiveApi}
            initialData={initial}
            onChange={onChange}
            viewModeEnabled={readOnly || presentation.presenting}
            zenModeEnabled={presentation.presenting}
            theme={themeResolved}
            name={loaded.meta.name}
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
      {presentation.overlay}
      <LeaveConfirmDialog
        open={leave.open}
        busy={leave.busy}
        onOpenChange={leave.onOpenChange}
        onDiscard={leave.discard}
        onSaveAndLeave={() => void leave.saveAndLeave()}
      />
    </div>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Snapshot of a stored blob after Excalidraw's own `restore()` normalisation. */
function normalizedSnapshot(blob: ExcalidrawFileBlob): ExcalidrawSnapshot {
  const restored = restore(
    {
      elements: (blob.elements as ExcalidrawElement[]) || [],
      appState: ((blob.appState as Partial<AppState>) || {}) as AppState,
      files: (blob.files as BinaryFiles) || {},
    } as Parameters<typeof restore>[0],
    null,
    null,
  );
  return makeExcalidrawSnapshot(
    restored.elements,
    restored.appState as AppState,
    (blob.files as BinaryFiles) || {},
  );
}

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
