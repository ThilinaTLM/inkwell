// SceneContextStrip — at-a-glance scene context, returned from
// Excalidraw's `renderTopRightUI` slot.
//
// Renders inside `.layer-ui__wrapper__top-right` as a sibling of the
// Library button so it reads as part of the native top bar (one flex
// row, `gap: .75rem`, `pointer-events: none` on the wrapper — children
// re-enable). Replaces the old `topRightChrome` floating overlay.
//
// Styling pulls Excalidraw's own CSS variables (`--island-bg-color`,
// `--shadow-island`, `--lg-button-size`, `--ui-font`,
// `--border-radius-lg`, `--default-border-color`, `--color-on-surface`).
// `src/index.css` already aliases the inkwell shadcn palette onto those
// variables, so the strip is automatically theme-aware without any
// Excalidraw selector overrides.
//
// Subscribes to `SceneEditorContext` for `status` / `errorMessage` /
// `readOnly`; that context is provided just outside `<Excalidraw>` in
// `SceneEditor.tsx`. After this migration `SceneContextStrip` is the
// only consumer of the context, but the indirection still earns its
// keep — `renderTopRightUI` is invoked deep inside Excalidraw's tree
// where prop drilling would otherwise be painful.

import {
  Alert02Icon,
  BookOpen01Icon,
  CheckmarkCircle02Icon,
  EyeIcon,
  Loading03Icon,
  PencilEdit02Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/utils";
import { useSceneEditorContext } from "./SceneEditor";

interface SceneContextStripProps {
  name: string;
  /** Forwarded from `renderTopRightUI`'s callback so we can collapse on small viewports. */
  isMobile?: boolean;
}

// Native-island surface shared by the desktop pill and the mobile
// status puck. Using inline style (rather than utility classes) for the
// four CSS variables that don't have Tailwind equivalents — anything
// expressible as a class lives in `className` below.
const islandStyle: CSSProperties = {
  backgroundColor: "var(--island-bg-color)",
  boxShadow: "var(--shadow-island)",
  borderRadius: "var(--border-radius-lg)",
  height: "var(--lg-button-size)",
  color: "var(--color-on-surface)",
  fontFamily: "var(--ui-font)",
};

export function SceneContextStrip({ name, isMobile }: SceneContextStripProps) {
  const { status, errorMessage, readOnly } = useSceneEditorContext();
  if (!name) return null;

  // readOnly takes precedence over save state — on a shared read-only
  // share token the save lifecycle never runs, so showing "Saved" or
  // "Editing" would be misleading.
  let statusLabel: string;
  let statusIcon: ReactNode;
  let statusTone = "text-muted-foreground/70";

  if (readOnly) {
    statusLabel = "Read-only";
    statusIcon = <HugeiconsIcon icon={EyeIcon} strokeWidth={2} />;
  } else {
    switch (status) {
      case "idle":
        statusLabel = "Ready";
        statusIcon = <HugeiconsIcon icon={PencilEdit02Icon} strokeWidth={2} />;
        break;
      case "dirty":
        statusLabel = "Editing";
        statusIcon = <HugeiconsIcon icon={PencilEdit02Icon} strokeWidth={2} />;
        statusTone = "text-foreground";
        break;
      case "saving":
        statusLabel = "Saving…";
        statusIcon = (
          <HugeiconsIcon icon={Loading03Icon} strokeWidth={2} className="animate-spin" />
        );
        statusTone = "text-foreground";
        break;
      case "saved":
        statusLabel = "Saved";
        statusIcon = <HugeiconsIcon icon={CheckmarkCircle02Icon} strokeWidth={2} />;
        // chart-5 is the success/green token in both inkwell themes.
        statusTone = "text-chart-5";
        break;
      case "error":
        statusLabel = errorMessage || "Save failed";
        statusIcon = <HugeiconsIcon icon={Alert02Icon} strokeWidth={2} />;
        statusTone = "text-destructive";
        break;
    }
  }

  // Mobile collapse: Excalidraw aggressively reclaims top-bar real
  // estate below ~640px (`isMobile` from `renderTopRightUI`). Show the
  // status icon only — the scene name is duplicated in the browser tab
  // title and the MainMenu hamburger anyway.
  if (isMobile) {
    return (
      <div
        title={`${name} — ${statusLabel}`}
        style={{ ...islandStyle, width: "var(--lg-button-size)" }}
        className={cn(
          "pointer-events-auto inline-flex items-center justify-center [&_svg]:size-4",
          statusTone,
        )}
      >
        {statusIcon}
      </div>
    );
  }

  return (
    <div
      style={islandStyle}
      className="pointer-events-auto inline-flex items-center gap-2 px-3 text-sm"
    >
      <span
        title={name}
        className="inline-flex max-w-[14rem] items-center gap-1.5 truncate font-medium"
      >
        <HugeiconsIcon
          icon={BookOpen01Icon}
          strokeWidth={1.6}
          className="size-4 shrink-0 opacity-70"
        />
        <span className="truncate">{name}</span>
      </span>
      <span
        aria-hidden
        className="h-4 w-px"
        style={{ backgroundColor: "var(--default-border-color)" }}
      />
      <span
        title={errorMessage || statusLabel}
        className={cn("inline-flex items-center gap-1.5 text-xs [&_svg]:size-4", statusTone)}
      >
        {statusIcon}
        <span>{statusLabel}</span>
      </span>
    </div>
  );
}
