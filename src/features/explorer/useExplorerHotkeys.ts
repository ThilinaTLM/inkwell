// useExplorerHotkeys — keyboard shortcuts that operate on the currently
// focused explorer item.
//
// Selection state is implicit: the DOM-focused card *is* the selected
// item. Cards stamp `data-explorer-item` ("scene" | "folder") and
// `data-explorer-id` so this hook can identify what's focused without
// any selection registry. Cards in `<SceneCard>` / `<FolderCard>` are
// already focusable (`tabIndex={0}`).
//
// Bindings:
//   - F2          → onRename(target)
//   - Delete      → onDelete(target)
//   - Backspace   → onDelete(target) (macOS convention)
//   - Enter       → onOpen(target)
//
// We attach the keydown listener to the container ref the consumer
// passes; events outside the explorer surface are ignored.

import { useEffect } from "react";

export interface ExplorerHotkeyHandlers {
  onRename?: (target: ExplorerItemFocus) => void;
  onDelete?: (target: ExplorerItemFocus) => void;
  onOpen?: (target: ExplorerItemFocus) => void;
}

export interface ExplorerItemFocus {
  kind: "scene" | "folder";
  id: string;
  element: HTMLElement;
}

export function useExplorerHotkeys(
  containerRef: React.RefObject<HTMLElement | null>,
  handlers: ExplorerHotkeyHandlers
) {
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    function focusedItem(): ExplorerItemFocus | null {
      const active = document.activeElement;
      if (!(active instanceof HTMLElement)) return null;
      const card = active.closest<HTMLElement>("[data-explorer-item]");
      if (!card) return null;
      const kind = card.dataset.explorerItem;
      const id = card.dataset.explorerId;
      if ((kind !== "scene" && kind !== "folder") || !id) return null;
      return { kind, id, element: card };
    }

    function onKey(e: KeyboardEvent) {
      // Ignore keys typed inside text inputs / textareas / contenteditable.
      const tgt = e.target;
      if (tgt instanceof HTMLElement) {
        const tag = tgt.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || tgt.isContentEditable) {
          return;
        }
      }

      const item = focusedItem();
      if (!item) return;

      if (e.key === "F2") {
        e.preventDefault();
        handlers.onRename?.(item);
        return;
      }
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        handlers.onDelete?.(item);
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        handlers.onOpen?.(item);
        return;
      }
    }

    el.addEventListener("keydown", onKey);
    return () => el.removeEventListener("keydown", onKey);
  }, [containerRef, handlers]);
}
