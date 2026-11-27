// SplitDivider — draggable / keyboard-resizable vertical divider between
// the code pane and the live preview. `value` is the left pane's share (%).

import { type RefObject, useState } from "react";
import { cn } from "@/lib/utils";

export const SPLIT_MIN = 25;
export const SPLIT_MAX = 75;
const clamp = (n: number) => Math.min(SPLIT_MAX, Math.max(SPLIT_MIN, n));

export function SplitDivider({
  value,
  onChange,
  containerRef,
}: {
  value: number;
  onChange: (pct: number) => void;
  /** Element whose width the percentage refers to (left + right panes). */
  containerRef: RefObject<HTMLElement | null>;
}) {
  const [dragging, setDragging] = useState(false);

  const move = (clientX: number) => {
    const el = containerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    if (r.width <= 0) return;
    onChange(clamp(((clientX - r.left) / r.width) * 100));
  };

  return (
    // biome-ignore lint/a11y/useSemanticElements: a focusable, resizable separator is a div (<hr> can't take focus/keys)
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize code and preview panes"
      aria-valuemin={SPLIT_MIN}
      aria-valuemax={SPLIT_MAX}
      aria-valuenow={Math.round(value)}
      tabIndex={0}
      data-testid="site-split-divider"
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        setDragging(true);
      }}
      onPointerMove={(e) => {
        if (dragging) move(e.clientX);
      }}
      onPointerUp={(e) => {
        e.currentTarget.releasePointerCapture(e.pointerId);
        setDragging(false);
      }}
      onPointerCancel={() => setDragging(false)}
      onDoubleClick={() => onChange(50)}
      onKeyDown={(e) => {
        if (e.key === "ArrowLeft") {
          e.preventDefault();
          onChange(clamp(value - 3));
        } else if (e.key === "ArrowRight") {
          e.preventDefault();
          onChange(clamp(value + 3));
        }
      }}
      className={cn(
        "group relative z-10 w-1.5 shrink-0 cursor-col-resize touch-none bg-border/60 outline-none transition-colors hover:bg-primary/40 focus-visible:bg-primary/60",
        dragging && "bg-primary/60",
      )}
    >
      <span className="absolute inset-y-0 -left-1.5 -right-1.5" aria-hidden />
    </div>
  );
}
