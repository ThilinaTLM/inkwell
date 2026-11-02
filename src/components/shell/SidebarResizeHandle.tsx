// Drag handle on the right edge of the desktop sidebar.
// Pointer drag resizes; ←/→ (Shift = larger step) adjust; Home/End jump to
// min/max; double-click resets to the default width.

import { useRef, useState } from "react";
import { cn } from "@/lib/utils";
import {
  SIDEBAR_DEFAULT_WIDTH,
  SIDEBAR_MAX_WIDTH,
  SIDEBAR_MIN_WIDTH,
  setSidebarWidth,
  shellStore,
  useShellState,
} from "./shellStore";

export function SidebarResizeHandle() {
  const width = useShellState((s) => s.sidebarWidth);
  const [dragging, setDragging] = useState(false);
  const start = useRef<{ x: number; width: number } | null>(null);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    start.current = { x: e.clientX, width: shellStore.get().sidebarWidth };
    setDragging(true);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!start.current) return;
    setSidebarWidth(start.current.width + e.clientX - start.current.x, false);
  };

  const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!start.current) return;
    start.current = null;
    setDragging(false);
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    setSidebarWidth(shellStore.get().sidebarWidth); // persist final width
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? 48 : 16;
    let next: number | null = null;
    if (e.key === "ArrowLeft") next = width - step;
    else if (e.key === "ArrowRight") next = width + step;
    else if (e.key === "Home") next = SIDEBAR_MIN_WIDTH;
    else if (e.key === "End") next = SIDEBAR_MAX_WIDTH;
    if (next === null) return;
    e.preventDefault();
    setSidebarWidth(next);
  };

  return (
    <>
      {/* biome-ignore lint/a11y/useSemanticElements: an <hr> can't be a focusable drag handle */}
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize sidebar"
        aria-valuemin={SIDEBAR_MIN_WIDTH}
        aria-valuemax={SIDEBAR_MAX_WIDTH}
        aria-valuenow={width}
        tabIndex={0}
        title="Drag to resize · double-click to reset"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onDoubleClick={() => setSidebarWidth(SIDEBAR_DEFAULT_WIDTH)}
        onKeyDown={onKeyDown}
        className="group absolute inset-y-0 -right-1.5 z-20 w-3 cursor-col-resize touch-none outline-none select-none"
      >
        <div
          className={cn(
            "mx-auto h-full w-px transition-colors delay-75 group-hover:bg-ring/60 group-focus-visible:bg-ring",
            dragging && "bg-ring",
          )}
        />
      </div>
      {/* Keep the col-resize cursor and block text selection / iframe capture while dragging. */}
      {dragging ? <div className="fixed inset-0 z-50 cursor-col-resize select-none" /> : null}
    </>
  );
}
