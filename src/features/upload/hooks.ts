// React bindings: drop targets and the tray summary.

import {
  type DragEvent as ReactDragEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useStore } from "@/lib/store";
import { collectDrop, dragHasFiles } from "./collectDrop";
import { isActiveStage, uploadEntries, uploadStore } from "./queue";

// Marker set on the native event by the innermost file-drop target, so
// outer targets (and the document-level handler) step aside. React
// dispatches from the root container, i.e. before `document` listeners.
const HANDLED = "__inkwellFileDrop";

function wasHandled(e: Event): boolean {
  return (e as unknown as Record<string, unknown>)[HANDLED] === true;
}
function markHandled(e: Event): void {
  (e as unknown as Record<string, unknown>)[HANDLED] = true;
}

export interface FileDropTargetOptions {
  folderId: string | null;
  folderName: string;
  enabled?: boolean;
}

export interface FileDropBindings {
  onDragEnter: (e: ReactDragEvent<HTMLElement>) => void;
  onDragOver: (e: ReactDragEvent<HTMLElement>) => void;
  onDragLeave: (e: ReactDragEvent<HTMLElement>) => void;
  onDrop: (e: ReactDragEvent<HTMLElement>) => void;
}

/**
 * Makes an element accept OS file drops (only drags whose
 * `dataTransfer.types` include "Files"; internal item drags pass
 * through untouched). Nested targets: the innermost wins.
 * `folderName` is for the caller's overlay (`<DropOverlay targetName>`).
 */
export function useFileDropTarget({ folderId, enabled = true }: FileDropTargetOptions): {
  isOver: boolean;
  bind: FileDropBindings;
} {
  const depth = useRef(0);
  const [isOver, setIsOver] = useState(false);
  const folderRef = useRef(folderId);
  folderRef.current = folderId;

  // A drop handled by a nested target (or outside the window) never
  // reaches our dragleave; reset on any drop / dragend.
  useEffect(() => {
    const reset = () => {
      depth.current = 0;
      setIsOver(false);
    };
    window.addEventListener("drop", reset, true);
    window.addEventListener("dragend", reset, true);
    return () => {
      window.removeEventListener("drop", reset, true);
      window.removeEventListener("dragend", reset, true);
    };
  }, []);

  useEffect(() => {
    if (!enabled) {
      depth.current = 0;
      setIsOver(false);
    }
  }, [enabled]);

  const onDragEnter = useCallback(
    (e: ReactDragEvent<HTMLElement>) => {
      if (!enabled || !dragHasFiles(e.dataTransfer)) return;
      depth.current++;
    },
    [enabled],
  );

  const onDragOver = useCallback(
    (e: ReactDragEvent<HTMLElement>) => {
      if (!enabled || !dragHasFiles(e.dataTransfer)) return;
      if (wasHandled(e.nativeEvent)) {
        setIsOver(false);
        return;
      }
      markHandled(e.nativeEvent);
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
      setIsOver(true);
    },
    [enabled],
  );

  const onDragLeave = useCallback(
    (e: ReactDragEvent<HTMLElement>) => {
      if (!enabled || !dragHasFiles(e.dataTransfer)) return;
      depth.current = Math.max(0, depth.current - 1);
      if (depth.current === 0) setIsOver(false);
    },
    [enabled],
  );

  const onDrop = useCallback(
    (e: ReactDragEvent<HTMLElement>) => {
      if (!enabled || !dragHasFiles(e.dataTransfer)) return;
      depth.current = 0;
      setIsOver(false);
      if (wasHandled(e.nativeEvent)) return;
      markHandled(e.nativeEvent);
      e.preventDefault();
      e.stopPropagation();
      const target = folderRef.current;
      // `collectDrop` snapshots the DataTransfer synchronously.
      void collectDrop(e.dataTransfer).then((entries) => uploadEntries(entries, target));
    },
    [enabled],
  );

  return {
    isOver: enabled && isOver,
    bind: useMemo(
      () => ({ onDragEnter, onDragOver, onDragLeave, onDrop }),
      [onDragEnter, onDragOver, onDragLeave, onDrop],
    ),
  };
}

const DROP_ATTR = "data-drop-folder";
const OVER_ATTR = "data-file-drop-over";

/**
 * Document-level OS file drop: dropping on any element (or descendant)
 * carrying `data-drop-folder="<folderId|root>"` uploads into that
 * folder. The hovered element gets `data-file-drop-over="true"` for
 * styling. File drops anywhere else are swallowed so the browser never
 * navigates away to the dropped file. Returns the hovered folder
 * (`"root"` for the root, `null` when none).
 */
export function useGlobalFileDrop(): { overFolderId: string | null } {
  const [overFolderId, setOverFolderId] = useState<string | null>(null);

  useEffect(() => {
    let current: Element | null = null;
    const setCurrent = (el: Element | null) => {
      if (current === el) return;
      current?.removeAttribute(OVER_ATTR);
      el?.setAttribute(OVER_ATTR, "true");
      current = el;
      setOverFolderId(el?.getAttribute(DROP_ATTR) ?? null);
    };
    const targetOf = (e: DragEvent): Element | null => {
      const t = e.target;
      return t instanceof Element ? t.closest(`[${DROP_ATTR}]`) : null;
    };

    const onOver = (e: DragEvent) => {
      if (!dragHasFiles(e.dataTransfer)) return;
      if (wasHandled(e)) {
        setCurrent(null);
        return;
      }
      e.preventDefault();
      const el = targetOf(e);
      if (e.dataTransfer) e.dataTransfer.dropEffect = el ? "copy" : "none";
      setCurrent(el);
    };
    const onLeave = (e: DragEvent) => {
      // Leaving the window.
      if (!e.relatedTarget) setCurrent(null);
    };
    const onDrop = (e: DragEvent) => {
      if (!dragHasFiles(e.dataTransfer)) return;
      e.preventDefault();
      const el = targetOf(e);
      setCurrent(null);
      if (wasHandled(e) || !el || !e.dataTransfer) return;
      markHandled(e);
      const raw = el.getAttribute(DROP_ATTR);
      const folderId = !raw || raw === "root" ? null : raw;
      void collectDrop(e.dataTransfer).then((entries) => uploadEntries(entries, folderId));
    };
    const onEnd = () => setCurrent(null);

    document.addEventListener("dragover", onOver);
    document.addEventListener("dragleave", onLeave);
    document.addEventListener("drop", onDrop);
    document.addEventListener("dragend", onEnd);
    return () => {
      document.removeEventListener("dragover", onOver);
      document.removeEventListener("dragleave", onLeave);
      document.removeEventListener("drop", onDrop);
      document.removeEventListener("dragend", onEnd);
      setCurrent(null);
    };
  }, []);

  return { overFolderId };
}

export interface UploadSummary {
  /** Jobs still queued / running / waiting on a conflict decision. */
  active: number;
  total: number;
  hasErrors: boolean;
  open: boolean;
}

export function useUploadSummary(): UploadSummary {
  const active = useStore(uploadStore, (s) => s.jobs.filter((j) => isActiveStage(j.stage)).length);
  const total = useStore(uploadStore, (s) => s.jobs.length);
  const hasErrors = useStore(uploadStore, (s) => s.jobs.some((j) => j.stage === "error"));
  const open = useStore(uploadStore, (s) => s.open);
  return useMemo(() => ({ active, total, hasErrors, open }), [active, total, hasErrors, open]);
}
