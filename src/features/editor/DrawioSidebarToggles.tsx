// Tier 2 of the responsive plan — sidebar / format toggles for
// narrow Kennedy viewports.
//
// Drawio's `Editor.smallScreenWidth = 1024` (grapheditor/Editor.js)
// collapses both side panels (shape library on the left, format on
// the right) to zero width whenever `screen.width <= 1024`. In our
// embed mode there's no visible toggle inside drawio's own UI for a
// touch user to expand them again, which is the audit's blocker B2 /
// B3. This component injects two toggle buttons into the menubar
// trailing slot that call drawio's own `toggleShapes` / `format`
// actions. State (`aria-pressed`) is driven by a MutationObserver
// watching the actual panel widths, so drawio's keyboard shortcuts
// (Ctrl+Shift+K / Ctrl+Shift+P) keep the toggles in sync.
//
// Visibility is gated by CSS (`@media (max-width: 1024px)` on
// `.inkwell-trailing-container` in MENUBAR_CSS) and by the React
// caller — the component itself doesn't try to know if it's mobile.
// Sketch theme has its own touch UI for shapes / format and skips
// rendering this component entirely.

import { LayoutLeftIcon, Settings02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useCallback, useEffect, useState } from "react";

interface DrawioSidebarTogglesProps {
  iframe: HTMLIFrameElement | null;
}

interface DrawioActionsRegistry {
  get: (key: string) => DrawioToggleAction | null;
}

interface DrawioToggleAction {
  funct: () => void;
  isSelected?: () => boolean;
}

interface DrawioWindow extends Window {
  editorUi?: {
    actions: DrawioActionsRegistry;
  };
}

function getActions(iframe: HTMLIFrameElement | null): DrawioActionsRegistry | null {
  if (!iframe) return null;
  const w = iframe.contentWindow as DrawioWindow | null;
  return w?.editorUi?.actions ?? null;
}

function isPanelVisible(iframe: HTMLIFrameElement | null, selector: string): boolean {
  const doc = iframe?.contentDocument;
  const el = doc?.querySelector<HTMLElement>(selector);
  if (!el) return false;
  // Both panels are zero-width when collapsed (drawio sets
  // hsplitPosition / formatWidth to 0). offsetWidth is the cheapest
  // truthy signal.
  return el.offsetWidth > 4;
}

export function DrawioSidebarToggles({ iframe }: DrawioSidebarTogglesProps) {
  // Local mirror of drawio's panel state. Driven by the
  // MutationObserver below, not by our own click handlers — this
  // way Ctrl+Shift+K / Ctrl+Shift+P keep the toggle visuals correct.
  const [shapesOpen, setShapesOpen] = useState(false);
  const [formatOpen, setFormatOpen] = useState(false);

  const refresh = useCallback(() => {
    setShapesOpen(isPanelVisible(iframe, ".geSidebarContainer:not(.geFormatContainer)"));
    setFormatOpen(isPanelVisible(iframe, ".geSidebarContainer.geFormatContainer"));
  }, [iframe]);

  useEffect(() => {
    const doc = iframe?.contentDocument;
    if (!doc) return;
    refresh();

    // Observe both sidebar containers for style/attribute changes
    // (drawio resizes them via inline width). attributes-only is
    // enough; we don't need subtree.
    const observer = new MutationObserver(refresh);
    const containers = doc.querySelectorAll(".geSidebarContainer");
    for (const c of containers) {
      observer.observe(c, { attributes: true, attributeFilter: ["style", "class"] });
    }
    // Also re-check on window resize — drawio re-flows panels on resize.
    const w = iframe.contentWindow;
    w?.addEventListener("resize", refresh);
    return () => {
      observer.disconnect();
      w?.removeEventListener("resize", refresh);
    };
  }, [iframe, refresh]);

  const toggleShapes = useCallback(() => {
    const action = getActions(iframe)?.get("toggleShapes");
    action?.funct();
    // Optimistic flip; observer will reconcile with the actual state.
    setShapesOpen((v) => !v);
  }, [iframe]);

  const toggleFormat = useCallback(() => {
    const action = getActions(iframe)?.get("format");
    action?.funct();
    setFormatOpen((v) => !v);
  }, [iframe]);

  return (
    <>
      <button
        type="button"
        className="inkwell-toggle-btn"
        data-pressed={shapesOpen ? "true" : "false"}
        aria-pressed={shapesOpen}
        title="Insert shape (Ctrl+Shift+K)"
        aria-label="Insert shape"
        onClick={toggleShapes}
      >
        <HugeiconsIcon icon={LayoutLeftIcon} strokeWidth={2} />
      </button>
      <button
        type="button"
        className="inkwell-toggle-btn"
        data-pressed={formatOpen ? "true" : "false"}
        aria-pressed={formatOpen}
        title="Format (Ctrl+Shift+P)"
        aria-label="Format"
        onClick={toggleFormat}
      >
        <HugeiconsIcon icon={Settings02Icon} strokeWidth={2} />
      </button>
    </>
  );
}
