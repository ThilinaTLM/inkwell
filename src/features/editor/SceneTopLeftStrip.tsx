// SceneTopLeftStrip — at-a-glance back affordance + scene-name capsule,
// returned from Excalidraw's patched `renderTopLeftUI` slot.
//
// Renders inside `.App-menu_top__left` (column 1 of `.App-menu_top`),
// taking the position previously occupied by the native MainMenu
// hamburger. The hamburger has been relocated to the top-right slot
// (sibling of the Library button) by our pnpm patch on
// `@excalidraw/excalidraw`; see `patches/@excalidraw__excalidraw@0.18.1.patch`.
//
// Contains, left-to-right:
//   1. An optional Back icon button (hidden when `back` is null —
//      e.g. visitors on a top-level share token have no parent to go to).
//   2. A standalone scene-name capsule with optional double-click rename.
//   3. A separate save/status control: floppy disk (manual save), spinner,
//      checkmark, warning-retry, or read-only eye.
//
// Styling matches the live computed style of Excalidraw's other
// top-bar buttons (`.main-menu-trigger`, `.default-sidebar-trigger`):
//   • background:  var(--color-surface-low)
//   • box-shadow:  0 0 0 1px var(--color-surface-lowest)  (1px ring)
//   • border-radius: var(--border-radius-lg)
//   • height: var(--lg-button-size)
// `src/index.css` already binds inkwell's shadcn palette onto these
// variables, so the strip is automatically theme-aware.
//
// Subscribes to `SceneEditorContext` for status / errorMessage /
// readOnly / onRequestRename / onSaveNow. The provider lives just
// outside `<Excalidraw>` in `SceneEditor.tsx`; the indirection keeps
// `renderTopLeftUI`'s closure dependencies shallow.

import {
  Alert02Icon,
  ArrowLeft01Icon,
  BookOpen01Icon,
  CheckmarkCircle02Icon,
  EyeIcon,
  FloppyDiskIcon,
  Loading03Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/utils";
import { useSceneEditorContext } from "./SceneEditor";

export interface SceneTopLeftStripProps {
  name: string;
  /**
   * Optional back affordance. Pass `null` to omit (e.g. top-level share
   * token landing where there's no parent to navigate to).
   */
  back: { onClick: () => void; label: string } | null;
  /** Forwarded from `renderTopLeftUI`'s callback so we can collapse on small viewports. */
  isMobile?: boolean;
}

// Native button surface, mirroring `.main-menu-trigger` /
// `.default-sidebar-trigger`. Inline style so the CSS variables resolve
// at runtime against Excalidraw's `.excalidraw` root.
const buttonSurfaceStyle: CSSProperties = {
  backgroundColor: "var(--color-surface-low)",
  boxShadow: "0 0 0 1px var(--color-surface-lowest)",
  borderRadius: "var(--border-radius-lg)",
  height: "var(--lg-button-size)",
  color: "var(--color-on-surface)",
  fontFamily: "var(--ui-font)",
};

export function SceneTopLeftStrip({ name, back, isMobile }: SceneTopLeftStripProps) {
  const { status, errorMessage, readOnly, onRequestRename, onSaveNow } = useSceneEditorContext();
  if (!name) return null;
  // Provider already nulls this out on read-only sessions, but guard
  // here too so a future change to that contract can't accidentally
  // expose a rename affordance to viewers.
  const renameInteractive = !readOnly && !!onRequestRename;
  const saveInteractive = !readOnly && !!onSaveNow && (status === "dirty" || status === "error");
  const saveDisabled = !readOnly && status === "saving";

  // readOnly takes precedence over save state — on a shared read-only
  // share token the save lifecycle never runs, so showing "Saved" or
  // "Save now" would be misleading.
  let statusTitle: string;
  let statusIcon: ReactNode;
  let statusTone = "text-muted-foreground/70";

  if (readOnly) {
    statusTitle = "Read-only";
    statusIcon = <HugeiconsIcon icon={EyeIcon} strokeWidth={2} />;
  } else {
    switch (status) {
      case "dirty":
        statusTitle = "Save now";
        statusIcon = <HugeiconsIcon icon={FloppyDiskIcon} strokeWidth={2} />;
        statusTone = "text-foreground";
        break;
      case "saving":
        statusTitle = "Saving…";
        statusIcon = (
          <HugeiconsIcon icon={Loading03Icon} strokeWidth={2} className="animate-spin" />
        );
        statusTone = "text-foreground";
        break;
      case "saved":
        statusTitle = "Saved";
        statusIcon = <HugeiconsIcon icon={CheckmarkCircle02Icon} strokeWidth={2} />;
        statusTone = "text-chart-5";
        break;
      case "error":
        statusTitle = errorMessage || "Save failed — click to retry";
        statusIcon = <HugeiconsIcon icon={Alert02Icon} strokeWidth={2} />;
        statusTone = "text-destructive";
        break;
    }
  }

  const renderStatusControl = (title = statusTitle) => {
    const className = cn(
      "inline-flex items-center justify-center [&_svg]:size-4",
      statusTone,
      saveInteractive && "cursor-pointer",
    );

    if (saveInteractive || saveDisabled) {
      return (
        <button
          type="button"
          title={title}
          aria-label={title}
          disabled={saveDisabled}
          onClick={saveInteractive ? onSaveNow : undefined}
          style={{ ...buttonSurfaceStyle, width: "var(--lg-button-size)" }}
          className={className}
        >
          {statusIcon}
        </button>
      );
    }

    return (
      <div
        role="status"
        title={title}
        aria-label={title}
        style={{ ...buttonSurfaceStyle, width: "var(--lg-button-size)" }}
        className={className}
      >
        {statusIcon}
      </div>
    );
  };

  // Mobile collapse: Excalidraw aggressively reclaims top-bar real
  // estate below ~640px. Show only the back button (when present) and
  // the save/status control — the scene name is duplicated in the
  // browser tab title and the relocated MainMenu trigger still provides
  // a nearby affordance.
  if (isMobile) {
    return (
      <div className="pointer-events-auto inline-flex items-center gap-2">
        {back && (
          <button
            type="button"
            aria-label={back.label}
            title={back.label}
            onClick={back.onClick}
            style={{ ...buttonSurfaceStyle, width: "var(--lg-button-size)" }}
            className="inline-flex items-center justify-center [&_svg]:size-4"
          >
            <HugeiconsIcon icon={ArrowLeft01Icon} strokeWidth={2} />
          </button>
        )}
        {renderStatusControl(`${name} — ${statusTitle}`)}
      </div>
    );
  }

  return (
    <div className="pointer-events-auto inline-flex items-center gap-2">
      {back && (
        <button
          type="button"
          aria-label={back.label}
          title={back.label}
          onClick={back.onClick}
          style={{ ...buttonSurfaceStyle, width: "var(--lg-button-size)" }}
          className="inline-flex items-center justify-center [&_svg]:size-4"
        >
          <HugeiconsIcon icon={ArrowLeft01Icon} strokeWidth={2} />
        </button>
      )}
      <div style={buttonSurfaceStyle} className="inline-flex items-center gap-2 px-3 text-sm">
        {/* biome-ignore lint/a11y/noStaticElementInteractions: double-click
            is a power-user shortcut into the rename dialog; the primary
            rename surface is `MainMenu → Rename…` (keyboard-accessible).
            Wrapping this span in a <button> would distort the capsule's
            layout for what is already a redundant affordance. */}
        <span
          title={renameInteractive ? `${name} — double-click to rename` : name}
          onDoubleClick={renameInteractive ? onRequestRename : undefined}
          className={cn(
            "inline-flex max-w-[14rem] items-center gap-1.5 truncate font-medium",
            renameInteractive && "cursor-text select-none",
          )}
        >
          <HugeiconsIcon
            icon={BookOpen01Icon}
            strokeWidth={1.6}
            className="size-4 shrink-0 opacity-70"
          />
          <span className="truncate">{name}</span>
        </span>
      </div>
      {renderStatusControl()}
    </div>
  );
}
