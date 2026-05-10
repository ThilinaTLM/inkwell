// NotesEditorChrome — top strip + kebab menu shown above `<BlockNoteView>`.
//
// BlockNote (unlike Excalidraw and draw.io) ships no native menu
// system to extend, so we render Inkwell's own thin chrome. Layout
// echoes `ExcalidrawTopLeftStrip`: a back button, the brand mark, the
// scene-name capsule (double-click to rename), then a save-status
// indicator and a kebab dropdown for tags / share / download / theme.
//
// All actions are owned by the parent page; this component is purely
// presentational.

import {
  Alert02Icon,
  ArrowLeft01Icon,
  CheckmarkCircle02Icon,
  Download01Icon,
  Edit02Icon,
  EyeIcon,
  FileExportIcon,
  FloppyDiskIcon,
  HashtagIcon,
  Loading03Icon,
  Menu01Icon,
  MoonIcon,
  Share08Icon,
  SunIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { type ReactNode, useId } from "react";
import { InkwellMark } from "@/components/InkwellMark";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { type ThemeMode, useTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";
import type { EditorSaveStatus } from "./lifecycle/types";

export interface NotesEditorChromeProps {
  /** File name; doubles as the rename-trigger target. */
  name: string;
  /** Optional back affordance; pass `null` to hide. */
  back: { onClick: () => void; label: string } | null;
  /** Read-only hides every write affordance and shows a "view-only" pill. */
  readOnly: boolean;
  status: EditorSaveStatus;
  errorMessage: string | null;
  /** Triggers an immediate save of the latest snapshot. `null` on read-only. */
  onSaveNow: (() => void) | null;
  /** Owner-only: open the rename dialog. `null` on read-only. */
  onRequestRename: (() => void) | null;
  /** Owner-only: open the tags dialog. `null` on read-only. */
  onTags: (() => void) | null;
  /** Owner-only: open the share dialog. `null` on read-only. */
  onShare: (() => void) | null;
  /** Trigger a `.notes.json` download. */
  onDownload: () => void;
  /** Run BlockNote's `blocksToMarkdownLossy()` and trigger an `.md` download. */
  onExportMarkdown: () => void;
  /** Optional shown-when-readOnly download item; null hides it (e.g. share with allowDownload=false). */
  allowDownload: boolean;
}

export function NotesEditorChrome({
  name,
  back,
  readOnly,
  status,
  errorMessage,
  onSaveNow,
  onRequestRename,
  onTags,
  onShare,
  onDownload,
  onExportMarkdown,
  allowDownload,
}: NotesEditorChromeProps) {
  const renameInteractive = !readOnly && !!onRequestRename;
  const labelId = useId();

  return (
    <div
      className={cn(
        "relative z-10 flex h-12 shrink-0 items-center gap-2 border-b border-border/60",
        "bg-background/80 px-3 backdrop-blur",
      )}
      role="toolbar"
      aria-labelledby={labelId}
    >
      {back ? (
        <Button
          variant="ghost"
          size="icon"
          onClick={back.onClick}
          aria-label={back.label}
          title={back.label}
        >
          <HugeiconsIcon icon={ArrowLeft01Icon} strokeWidth={1.8} className="size-4" />
        </Button>
      ) : null}

      <InkwellMark className="size-5 text-foreground/80" />

      {renameInteractive ? (
        // A11y: a double-clickable static element fails the
        // no-static-element-interactions rule, so when rename is
        // available we render a real button so keyboard users get a
        // standard interaction (Enter/Space → open rename dialog).
        // Native button styling is overridden to keep the strip
        // visually identical to the read-only span variant below.
        <button
          id={labelId}
          type="button"
          title="Double-click or press Enter to rename"
          onClick={onRequestRename ?? undefined}
          onDoubleClick={onRequestRename ?? undefined}
          className="min-w-0 flex-1 cursor-text truncate text-left font-heading text-sm font-medium text-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
        >
          {name}
        </button>
      ) : (
        <span
          id={labelId}
          title={name}
          className="min-w-0 flex-1 truncate font-heading text-sm font-medium text-foreground"
        >
          {name}
        </span>
      )}

      <SaveStatusBadge
        readOnly={readOnly}
        status={status}
        errorMessage={errorMessage}
        onSaveNow={onSaveNow}
      />

      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button variant="ghost" size="icon" aria-label="Notes menu">
              <HugeiconsIcon icon={Menu01Icon} strokeWidth={1.8} className="size-4" />
            </Button>
          }
        />
        <DropdownMenuContent align="end">
          {!readOnly && onRequestRename ? (
            <DropdownMenuItem onClick={onRequestRename}>
              <HugeiconsIcon icon={Edit02Icon} strokeWidth={1.8} />
              Rename…
            </DropdownMenuItem>
          ) : null}
          {!readOnly && onTags ? (
            <DropdownMenuItem onClick={onTags}>
              <HugeiconsIcon icon={HashtagIcon} strokeWidth={1.8} />
              Edit tags…
            </DropdownMenuItem>
          ) : null}
          {!readOnly && onShare ? (
            <DropdownMenuItem onClick={onShare}>
              <HugeiconsIcon icon={Share08Icon} strokeWidth={1.8} />
              Share…
            </DropdownMenuItem>
          ) : null}
          {(!readOnly || allowDownload) && (!readOnly || onTags || onShare) ? (
            <DropdownMenuSeparator />
          ) : null}
          {!readOnly || allowDownload ? (
            <>
              <DropdownMenuItem onClick={onDownload}>
                <HugeiconsIcon icon={Download01Icon} strokeWidth={1.8} />
                Download .notes.json
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onExportMarkdown}>
                <HugeiconsIcon icon={FileExportIcon} strokeWidth={1.8} />
                Export as Markdown…
              </DropdownMenuItem>
            </>
          ) : null}
          <DropdownMenuSeparator />
          <ThemeSubmenu />
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function SaveStatusBadge({
  readOnly,
  status,
  errorMessage,
  onSaveNow,
}: {
  readOnly: boolean;
  status: EditorSaveStatus;
  errorMessage: string | null;
  onSaveNow: (() => void) | null;
}) {
  if (readOnly) {
    return (
      <span
        className="inline-flex items-center gap-1.5 rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground"
        title="View-only"
      >
        <HugeiconsIcon icon={EyeIcon} strokeWidth={1.8} className="size-3.5" />
        View-only
      </span>
    );
  }
  let label: string;
  let icon: ReactNode;
  let tone = "text-muted-foreground";
  switch (status) {
    case "saving":
      label = "Saving…";
      icon = (
        <HugeiconsIcon icon={Loading03Icon} strokeWidth={1.8} className="size-3.5 animate-spin" />
      );
      break;
    case "dirty":
      label = "Save now";
      icon = <HugeiconsIcon icon={FloppyDiskIcon} strokeWidth={1.8} className="size-3.5" />;
      tone = "text-foreground";
      break;
    case "error":
      label = errorMessage || "Save failed — retry";
      icon = <HugeiconsIcon icon={Alert02Icon} strokeWidth={1.8} className="size-3.5" />;
      tone = "text-destructive";
      break;
    default:
      label = "Saved";
      icon = <HugeiconsIcon icon={CheckmarkCircle02Icon} strokeWidth={1.8} className="size-3.5" />;
  }
  const interactive = (status === "dirty" || status === "error") && !!onSaveNow;
  if (interactive) {
    return (
      <button
        type="button"
        onClick={onSaveNow ?? undefined}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs",
          "ring-1 ring-border/60 hover:bg-muted",
          tone,
        )}
        title={label}
      >
        {icon}
        <span className="hidden sm:inline">{label}</span>
      </button>
    );
  }
  return (
    <span
      className={cn("inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs", tone)}
      title={label}
    >
      {icon}
      <span className="hidden sm:inline">{label}</span>
    </span>
  );
}

function ThemeSubmenu() {
  const { mode, setMode } = useTheme();
  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>
        <HugeiconsIcon icon={mode === "dark" ? MoonIcon : SunIcon} strokeWidth={1.8} />
        Theme
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent>
        <DropdownMenuRadioGroup value={mode} onValueChange={(v) => setMode(v as ThemeMode)}>
          <DropdownMenuRadioItem value="light">Light</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="dark">Dark</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="system">System</DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}
