// Present mode for whiteboards (knowledge-sharing sessions).
//
// Fullscreen, header hidden, Excalidraw in view + zen mode with the
// laser pointer active. If the scene has frames, each frame is a slide
// (reading order: top-to-bottom rows, left-to-right within a row);
// otherwise the whole drawing is one slide. Navigation: ←/→, Space,
// PageUp/PageDown, Home/End. A small floating bar offers prev / n of N /
// next, laser ↔ hand and Exit. Esc leaves (the browser's own Esc exits
// fullscreen, which we mirror). Nothing is saved from present mode — the
// editor ignores `onChange` while presenting.

import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type { AppState, ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import {
  ArrowLeft01Icon,
  ArrowRight01Icon,
  Cancel01Icon,
  Cursor01Icon,
  HandGrabIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { type RefObject, useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Tool = "laser" | "hand";

/** Frames in reading order, or one slide containing everything. */
export function computeSlides(elements: readonly ExcalidrawElement[]): ExcalidrawElement[][] {
  const live = elements.filter((e) => !e.isDeleted);
  const frames = live.filter((e) => e.type === "frame" || e.type === "magicframe");
  if (frames.length === 0) return [live];
  const sorted = [...frames].sort((a, b) => {
    const sameRow = Math.abs(a.y - b.y) < Math.min(a.height, b.height) / 2;
    return sameRow ? a.x - b.x : a.y - b.y;
  });
  return sorted.map((f) => [f]);
}

export interface Presentation {
  presenting: boolean;
  start: () => void;
  exit: () => void;
  overlay: React.ReactNode;
}

export function usePresentation(apiRef: RefObject<ExcalidrawImperativeAPI | null>): Presentation {
  const [presenting, setPresenting] = useState(false);
  const [index, setIndex] = useState(0);
  const [count, setCount] = useState(1);
  const [tool, setToolState] = useState<Tool>("laser");
  const slidesRef = useRef<ExcalidrawElement[][]>([]);
  const indexRef = useRef(0);
  const fullscreenRef = useRef(false);
  const frameRenderingRef = useRef<AppState["frameRendering"] | null>(null);
  const presentingRef = useRef(false);
  presentingRef.current = presenting;

  const setTool = useCallback(
    (next: Tool) => {
      setToolState(next);
      apiRef.current?.setActiveTool({ type: next });
    },
    [apiRef],
  );

  const goTo = useCallback(
    (i: number, animate = true) => {
      const api = apiRef.current;
      const slides = slidesRef.current;
      if (!api || slides.length === 0) return;
      const next = Math.max(0, Math.min(slides.length - 1, i));
      indexRef.current = next;
      setIndex(next);
      api.scrollToContent(slides[next], {
        fitToViewport: true,
        viewportZoomFactor: 0.92,
        animate,
        duration: 350,
      });
    },
    [apiRef],
  );

  const start = useCallback(() => {
    const api = apiRef.current;
    if (!api || presentingRef.current) return;
    slidesRef.current = computeSlides(api.getSceneElements());
    setCount(slidesRef.current.length);
    indexRef.current = 0;
    setIndex(0);
    setToolState("laser");
    const prev = api.getAppState().frameRendering;
    frameRenderingRef.current = prev;
    // Clean slides: no frame names / outlines while presenting.
    api.updateScene({
      appState: { frameRendering: { ...prev, name: false, outline: false } } as unknown as AppState,
    });
    fullscreenRef.current = false;
    void document.documentElement
      .requestFullscreen?.()
      .then(() => {
        fullscreenRef.current = true;
      })
      .catch(() => {
        /* Esc / the Exit button still work without fullscreen */
      });
    setPresenting(true);
    // View mode must be applied before the laser tool can be selected.
    window.setTimeout(() => {
      apiRef.current?.setActiveTool({ type: "laser" });
      goTo(0, false);
    }, 150);
  }, [apiRef, goTo]);

  const exit = useCallback(() => {
    if (!presentingRef.current) return;
    setPresenting(false);
    presentingRef.current = false;
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    const api = apiRef.current;
    const prev = frameRenderingRef.current;
    window.setTimeout(() => {
      if (!api) return;
      if (prev) api.updateScene({ appState: { frameRendering: prev } as unknown as AppState });
      api.setActiveTool({ type: "selection" });
    }, 50);
  }, [apiRef]);

  useEffect(() => {
    if (!presenting) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      let handled = true;
      switch (e.key) {
        case "ArrowRight":
        case "ArrowDown":
        case "PageDown":
        case " ":
          goTo(indexRef.current + 1);
          break;
        case "ArrowLeft":
        case "ArrowUp":
        case "PageUp":
          goTo(indexRef.current - 1);
          break;
        case "Home":
          goTo(0);
          break;
        case "End":
          goTo(slidesRef.current.length - 1);
          break;
        case "Escape":
          exit();
          break;
        default:
          handled = false;
      }
      if (handled) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    const onFullscreen = () => {
      if (fullscreenRef.current && !document.fullscreenElement) exit();
    };
    window.addEventListener("keydown", onKey, true);
    document.addEventListener("fullscreenchange", onFullscreen);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      document.removeEventListener("fullscreenchange", onFullscreen);
    };
  }, [presenting, goTo, exit]);

  // Leaving the page while presenting must not strand the browser in fullscreen.
  useEffect(
    () => () => {
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    },
    [],
  );

  const overlay = presenting ? (
    <div
      data-testid="present-bar"
      className="fixed bottom-5 left-1/2 z-[70] flex -translate-x-1/2 items-center gap-1 rounded-full border border-border bg-popover/90 p-1 text-popover-foreground opacity-70 shadow-lg backdrop-blur transition-opacity focus-within:opacity-100 hover:opacity-100"
    >
      <Button
        variant="ghost"
        size="icon"
        onClick={() => goTo(index - 1)}
        disabled={index === 0}
        aria-label="Previous slide"
        title="Previous (←)"
      >
        <HugeiconsIcon icon={ArrowLeft01Icon} strokeWidth={2} />
      </Button>
      <output className="min-w-12 text-center text-sm tabular-nums" aria-live="polite">
        {index + 1} / {count}
      </output>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => goTo(index + 1)}
        disabled={index >= count - 1}
        aria-label="Next slide"
        title="Next (→ / Space)"
      >
        <HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={2} />
      </Button>
      <span aria-hidden className="mx-1 h-5 w-px bg-border" />
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setTool(tool === "laser" ? "hand" : "laser")}
        aria-pressed={tool === "laser"}
        aria-label={tool === "laser" ? "Laser pointer (switch to hand)" : "Hand (switch to laser)"}
        title={
          tool === "laser" ? "Laser pointer — click for hand tool" : "Hand tool — click for laser"
        }
        className={cn(tool === "laser" && "text-primary")}
      >
        <HugeiconsIcon icon={tool === "laser" ? Cursor01Icon : HandGrabIcon} strokeWidth={1.8} />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        onClick={exit}
        aria-label="Exit presentation"
        title="Exit (Esc)"
      >
        <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} />
      </Button>
    </div>
  ) : null;

  return { presenting, start, exit, overlay };
}
