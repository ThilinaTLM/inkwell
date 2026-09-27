// Rubber-band (marquee) selection on the empty area of a scroll
// container. Hit-tests `[data-item]` descendants (their `data-key`),
// auto-scrolls near the edges. ⇧ adds to the selection, ⌘/Ctrl toggles.

import {
  type PointerEvent as ReactPointerEvent,
  type RefObject,
  useCallback,
  useRef,
  useState,
} from "react";
import { dispatchSelection, getSelState } from "./state";

export interface MarqueeRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

const EDGE = 36;
const MAX_SPEED = 18;
const IGNORE = "[data-item],[data-no-marquee],button,input,a,textarea,select,[role='separator']";

export function useMarquee({
  containerRef,
  scope,
  enabled = true,
}: {
  containerRef: RefObject<HTMLElement | null>;
  scope: string;
  enabled?: boolean;
}): { onPointerDown: (e: ReactPointerEvent<HTMLElement>) => void; rect: MarqueeRect | null } {
  const [rect, setRect] = useState<MarqueeRect | null>(null);
  const raf = useRef<number | null>(null);

  const onPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLElement>) => {
      const el = containerRef.current;
      if (!enabled || !el || e.button !== 0 || e.pointerType === "touch") return;
      const target = e.target as Element;
      if (target.closest(IGNORE)) return;
      const box = el.getBoundingClientRect();
      // Clicks on the scrollbars.
      if (e.clientX - box.left > el.clientWidth || e.clientY - box.top > el.clientHeight) return;

      el.focus({ preventScroll: true });
      const mod = e.metaKey || e.ctrlKey;
      const mode = e.shiftKey ? "add" : mod ? "toggle" : "replace";
      const base = mode === "replace" ? [] : getSelState(scope).selected;
      const start = {
        x: e.clientX - box.left + el.scrollLeft,
        y: e.clientY - box.top + el.scrollTop,
      };
      let last = { x: e.clientX, y: e.clientY };
      let active = false;
      const pointerId = e.pointerId;
      try {
        el.setPointerCapture(pointerId);
      } catch {
        /* ignore */
      }

      const update = () => {
        const b = el.getBoundingClientRect();
        const cx = last.x - b.left + el.scrollLeft;
        const cy = last.y - b.top + el.scrollTop;
        const r = {
          left: Math.max(0, Math.min(start.x, cx)),
          top: Math.max(0, Math.min(start.y, cy)),
          width: Math.abs(cx - start.x),
          height: Math.abs(cy - start.y),
        };
        setRect(r);
        const hits: string[] = [];
        for (const node of el.querySelectorAll<HTMLElement>("[data-item]")) {
          const nr = node.getBoundingClientRect();
          const l = nr.left - b.left + el.scrollLeft;
          const t = nr.top - b.top + el.scrollTop;
          if (
            l < r.left + r.width &&
            l + nr.width > r.left &&
            t < r.top + r.height &&
            t + nr.height > r.top
          ) {
            const k = node.dataset.key;
            if (k) hits.push(k);
          }
        }
        dispatchSelection(scope, { type: "marquee", hits, base, mode });
      };

      const tick = () => {
        raf.current = null;
        if (!active) return;
        const b = el.getBoundingClientRect();
        let dx = 0;
        let dy = 0;
        if (last.y < b.top + EDGE) dy = -Math.ceil(((b.top + EDGE - last.y) / EDGE) * MAX_SPEED);
        else if (last.y > b.bottom - EDGE)
          dy = Math.ceil(((last.y - (b.bottom - EDGE)) / EDGE) * MAX_SPEED);
        if (last.x < b.left + EDGE) dx = -Math.ceil(((b.left + EDGE - last.x) / EDGE) * MAX_SPEED);
        else if (last.x > b.right - EDGE)
          dx = Math.ceil(((last.x - (b.right - EDGE)) / EDGE) * MAX_SPEED);
        if (dx || dy) {
          const beforeTop = el.scrollTop;
          const beforeLeft = el.scrollLeft;
          el.scrollBy(dx, dy);
          if (el.scrollTop !== beforeTop || el.scrollLeft !== beforeLeft) update();
          raf.current = requestAnimationFrame(tick);
        }
      };

      const onMove = (ev: PointerEvent) => {
        if (ev.pointerId !== pointerId) return;
        last = { x: ev.clientX, y: ev.clientY };
        if (!active) {
          const b = el.getBoundingClientRect();
          const dx = ev.clientX - b.left + el.scrollLeft - start.x;
          const dy = ev.clientY - b.top + el.scrollTop - start.y;
          if (Math.hypot(dx, dy) < 4) return;
          active = true;
        }
        update();
        if (raf.current === null) raf.current = requestAnimationFrame(tick);
      };
      const onUp = (ev: PointerEvent) => {
        if (ev.pointerId !== pointerId) return;
        el.removeEventListener("pointermove", onMove);
        el.removeEventListener("pointerup", onUp);
        el.removeEventListener("pointercancel", onUp);
        if (raf.current !== null) cancelAnimationFrame(raf.current);
        raf.current = null;
        try {
          el.releasePointerCapture(pointerId);
        } catch {
          /* ignore */
        }
        if (!active && mode === "replace") dispatchSelection(scope, { type: "clear" });
        active = false;
        setRect(null);
      };
      el.addEventListener("pointermove", onMove);
      el.addEventListener("pointerup", onUp);
      el.addEventListener("pointercancel", onUp);
    },
    [containerRef, scope, enabled],
  );

  return { onPointerDown, rect };
}
