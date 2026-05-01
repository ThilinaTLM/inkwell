// Shared Excalidraw editor used by both the owner Editor page and the
// share-token SharedEditor page. The page-specific code only has to provide
// load/save/saveThumb closures.
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

import { useCallback, useEffect, useRef, useState } from "react";
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
}

type SaveStatus = "idle" | "dirty" | "saving" | "saved" | "error";

export default function SceneEditor({
  loaded,
  save,
  saveThumb,
  onReload,
  reload,
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

  // ─── Persist scene ──────────────────────────────────────────────────
  const doSave = useCallback(
    async (elements: readonly ExcalidrawElement[], appState: AppState, files: BinaryFiles) => {
      if (readOnly) return;
      if (inflightRef.current) {
        // We already have a save in-flight; mark dirty and let the next debounce cycle pick it up.
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
          // Server has a newer version. Re-fetch and let the user merge by hand.
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
    async (elements: readonly ExcalidrawElement[], appState: AppState, files: BinaryFiles) => {
      if (!saveThumb || readOnly) return;
      if (elements.length === 0) return; // skip empty scenes
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
        // Cap thumbnail dimensions for grid display + R2 size.
        svg.setAttribute("width", "640");
        svg.removeAttribute("height");
        await saveThumb(svg.outerHTML);
      } catch {
        // Thumbnails are best-effort; don't surface errors.
      }
    },
    [saveThumb, readOnly]
  );

  const debouncedThumb = useDebounced(doThumb, 30_000);

  // ─── Wire onChange ──────────────────────────────────────────────────
  const onChange = useCallback(
    (elements: readonly ExcalidrawElement[], appState: AppState, files: BinaryFiles) => {
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

  // Initial data passed once. Excalidraw's `key` (set by parent on scene id)
  // forces a clean remount when navigating to a different scene.
  const initial = {
    elements: (loaded.blob.elements as ExcalidrawElement[]) || [],
    appState: (loaded.blob.appState as Partial<AppState>) || {},
    files: (loaded.blob.files as BinaryFiles) || {},
  };

  return (
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
        />
      </div>
      <SaveBadge status={status} message={errorMsg} readOnly={readOnly} />
      {/* `api` retained for future imperative needs (e.g. zoom-to-fit). */}
      {/* eslint-disable-next-line @typescript-eslint/no-unused-vars */}
      {api ? null : null}
    </div>
  );
}

// Strip transient appState that isn't meaningful to persist. Keeping this
// list small reduces churn in saved blobs but preserves real settings like
// background color, grid mode, theme.
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
// flips to "saved". On an in-memory scene the status can still be "pending",
// so we patch a copy before exporting the thumbnail. (Pattern lifted from
// ExcaliDash.)
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

function SaveBadge({
  status,
  message,
  readOnly,
}: {
  status: SaveStatus;
  message: string | null;
  readOnly: boolean;
}) {
  // The Excalidraw canvas has its own floating UI overlays; we sit on top of
  // the canvas in the bottom-left so the badge stays out of the toolbar.
  let label = "";
  let icon = null;
  let tone = "bg-popover text-popover-foreground";

  if (readOnly) {
    label = "Read-only";
    icon = <HugeiconsIcon icon={EyeIcon} strokeWidth={2} />;
    tone = "bg-popover text-muted-foreground";
  } else {
    switch (status) {
      case "idle":
        label = "Ready";
        icon = <HugeiconsIcon icon={PencilEdit02Icon} strokeWidth={2} />;
        tone = "bg-popover text-muted-foreground";
        break;
      case "dirty":
        label = "Editing";
        icon = <HugeiconsIcon icon={PencilEdit02Icon} strokeWidth={2} />;
        tone = "bg-popover text-foreground";
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
        tone = "bg-popover text-foreground";
        break;
      case "saved":
        label = "Saved";
        icon = <HugeiconsIcon icon={CheckmarkCircle02Icon} strokeWidth={2} />;
        tone = "bg-popover text-emerald-400";
        break;
      case "error":
        label = message || "Save failed";
        icon = <HugeiconsIcon icon={Alert02Icon} strokeWidth={2} />;
        tone = "bg-destructive/15 text-destructive";
        break;
    }
  }
  return (
    <div
      title={message || undefined}
      className={cn(
        "pointer-events-none absolute bottom-3 left-3 z-20 inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[0.6875rem] font-medium ring-1 ring-foreground/10 backdrop-blur supports-backdrop-filter:bg-popover/80",
        tone
      )}
    >
      <span className="[&_svg]:size-3">{icon}</span>
      {label}
    </div>
  );
}
