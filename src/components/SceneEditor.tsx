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

import {
  ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { Excalidraw, exportToSvg } from "@excalidraw/excalidraw";
import type {
  ExcalidrawImperativeAPI,
  AppState,
  BinaryFiles,
} from "@excalidraw/excalidraw/types";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Alert02Icon,
  CheckmarkCircle02Icon,
  EyeIcon,
  Loading03Icon,
  PencilEdit02Icon,
} from "@hugeicons/core-free-icons";

import type { LoadedScene, SceneBlob } from "@/api";
import { ApiError } from "@/api";
import { useDebounced } from "@/hooks/useDebounced";
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
   * Excalidraw UI (MainMenu, Footer, Sidebar). Use the `<EditorSaveBadge>`
   * exported below inside `<Footer>` to surface save status; it pulls from
   * the internal context so the badge stays in sync without prop drilling.
   */
  chrome?: ReactNode;
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
}: SceneEditorProps) {
  const [api, setApi] = useState<ExcalidrawImperativeAPI | null>(null);
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Mutable refs so the debounced callbacks always see the latest values
  // without re-creating themselves.
  const versionRef = useRef(loaded.meta.version);
  const inflightRef = useRef(false);
  const readOnly = loaded.permission !== "write";

  // Reset when a different scene is loaded (e.g. navigating between scenes).
  useEffect(() => {
    versionRef.current = loaded.meta.version;
    setStatus("idle");
    setErrorMsg(null);
  }, [loaded.meta.id, loaded.meta.version]);

  // Sync external name changes (e.g. rename dialog) into Excalidraw's
  // appState. The worker treats appState.name as the canonical scene
  // name on save (so editing the name in Excalidraw's export dialog
  // works), which means after an owner-driven rename we must push the
  // new name back into appState. Otherwise the next debounced autosave
  // would revert the rename using the stale appState.name.
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
    async (
      elements: readonly ExcalidrawElement[],
      appState: AppState,
      files: BinaryFiles
    ) => {
      if (readOnly) return;
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
          setErrorMsg(e instanceof ApiError ? e.message : "save failed");
        }
      } finally {
        inflightRef.current = false;
      }
    },
    [save, reload, onReload, loaded.meta.name, readOnly]
  );

  const debouncedSave = useDebounced(doSave, 1000);

  // ─── Thumbnail (debounced 30s) ──────────────────────────────────────
  const doThumb = useCallback(
    async (
      elements: readonly ExcalidrawElement[],
      appState: AppState,
      files: BinaryFiles
    ) => {
      if (!saveThumb || readOnly) return;
      if (elements.length === 0) return;
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
      } catch {
        // Best-effort.
      }
    },
    [saveThumb, readOnly]
  );

  const debouncedThumb = useDebounced(doThumb, 30_000);

  // ─── Wire onChange ──────────────────────────────────────────────────
  const onChange = useCallback(
    (
      elements: readonly ExcalidrawElement[],
      appState: AppState,
      files: BinaryFiles
    ) => {
      if (readOnly) return;
      setStatus((s) => (s === "saving" ? s : "dirty"));
      debouncedSave(elements, appState, files);
      debouncedThumb(elements, appState, files);
    },
    [debouncedSave, debouncedThumb, readOnly]
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
    <SceneEditorContext.Provider
      value={{ status, errorMessage: errorMsg, readOnly }}
    >
      <div className="relative h-full w-full">
        <div className="absolute inset-0">
          <Excalidraw
            excalidrawAPI={(a) => setApi(a)}
            initialData={initial}
            onChange={onChange}
            viewModeEnabled={readOnly}
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
      </div>
    </SceneEditorContext.Provider>
  );
}

// ─── Save status badge — meant to be rendered inside Excalidraw's <Footer>
//
// Reads from SceneEditorContext so it stays in sync with the parent's save
// state without prop drilling. Styled as a paper-pill that fits Excalidraw's
// own UI language (small font, soft border, blends with the canvas chrome).
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
        icon = (
          <HugeiconsIcon
            icon={Loading03Icon}
            strokeWidth={2}
            className="animate-spin"
          />
        );
        tone = "bg-paper-elev/90 text-ink";
        break;
      case "saved":
        label = "Saved";
        icon = (
          <HugeiconsIcon icon={CheckmarkCircle02Icon} strokeWidth={2} />
        );
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
        "pointer-events-none inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[0.6875rem] font-sans font-medium ring-1 ring-ink-soft/15 backdrop-blur",
        tone
      )}
    >
      <span className="[&_svg]:size-3">{icon}</span>
      {label}
    </div>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────────

// Strip transient appState that isn't meaningful to persist.
function pickPersistableAppState(
  appState: AppState,
  fallbackName: string
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
    ...rest
  } = appState as any;
  return { ...rest, name: (rest as any).name || fallbackName };
}

// Excalidraw won't render embedded images during export until their `status`
// flips to "saved". Patch a copy before exporting the thumbnail. (Pattern
// borrowed from ExcaliDash.)
function normalizeImagesForExport(
  elements: readonly ExcalidrawElement[],
  files: BinaryFiles
): ExcalidrawElement[] {
  return elements.map((el) => {
    if (el.type !== "image" || typeof el.fileId !== "string") return el;
    const file = files[el.fileId as keyof typeof files] as
      | { dataURL?: string }
      | undefined;
    const hasData = !!file?.dataURL?.startsWith?.("data:image/");
    if (!hasData || (el as any).status === "saved") return el;
    return { ...el, status: "saved" } as ExcalidrawElement;
  });
}
