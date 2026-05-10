// NotesEditorChrome — top strip + dropdowns shown above `<BlockNoteView>`.
//
// Layout mirrors `ExcalidrawTopLeftStrip`:
//
//   ┌──── left ─────────────────────────┐  ┌──── right ───────────────────────┐
//   │ [logo*] [name] [save status]      │  │ [width] [font] [theme] [more ▾] │
//   └───────────────────────────────────┘  └─────────────────────────────────┘
//
// (* the logo doubles as the back-to-dashboard affordance — clicking
//    it returns to the parent folder, with a leave-confirm dialog if
//    the document is dirty. We deliberately don't render a separate
//    back button; the brand mark is enough and keeps the strip clean.)
//
// Everything destructive or seldom-used (rename, tags, share,
// download, export) lives in the kebab menu on the far right. The
// three quick-toggle buttons (width / font / theme) are split out so
// users can flip them without diving into a submenu — the same
// affordance pattern Notion uses for its width and typeface controls.
//
// All actions are owned by the parent page (`EditorPage` /
// `SharedEditorPage`); this component is purely presentational beyond
// the local state that drives the dropdown menus.

import {
  Alert02Icon,
  CheckmarkCircle02Icon,
  ComputerIcon,
  Download01Icon,
  Edit02Icon,
  EyeIcon,
  FileExportIcon,
  FloppyDiskIcon,
  HashtagIcon,
  Layout01Icon,
  Loading03Icon,
  Menu01Icon,
  Moon02Icon,
  Share08Icon,
  SunIcon,
  TextFontIcon,
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
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { type ThemeMode, useTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";
import type { EditorSaveStatus } from "./lifecycle/types";
import {
  NOTES_FONTS,
  NOTES_WIDTHS,
  type NotesEditorFont,
  type NotesEditorWidth,
  useNotesPreferences,
} from "./notes/preferences";

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
  const showOverflow =
    (!readOnly && (onRequestRename || onTags || onShare)) || !readOnly || allowDownload;

  return (
    <div
      className={cn(
        "relative z-10 flex h-12 shrink-0 items-center gap-2 border-b border-border/60",
        "bg-background/80 px-3 backdrop-blur",
      )}
      role="toolbar"
      aria-labelledby={labelId}
    >
      {/* ─── Left cluster: logo + filename + save status ───────────────
       *  These three sit as one tight visual group on the far left.
       *  The filename truncates (no `flex-1`) so the save indicator
       *  stays glued to its right edge instead of being pushed to
       *  the middle by an over-long file name. The flex spacer below
       *  takes the remaining width and shoves the right cluster to
       *  the edge. */}
      {back ? (
        <button
          type="button"
          onClick={back.onClick}
          aria-label={back.label}
          title={back.label}
          className={cn(
            "inline-flex size-8 shrink-0 items-center justify-center rounded-md",
            "text-foreground/80 transition-colors hover:bg-muted hover:text-foreground",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          )}
        >
          <InkwellMark className="size-5" />
        </button>
      ) : (
        <InkwellMark className="size-5 shrink-0 text-foreground/80" />
      )}

      {renameInteractive ? (
        <button
          id={labelId}
          type="button"
          title="Double-click or press Enter to rename"
          onClick={onRequestRename ?? undefined}
          onDoubleClick={onRequestRename ?? undefined}
          className={cn(
            "min-w-0 max-w-[40ch] cursor-text truncate text-left font-heading text-sm font-medium",
            "rounded-sm text-foreground hover:text-foreground",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          )}
        >
          {name}
        </button>
      ) : (
        <span
          id={labelId}
          title={name}
          className="min-w-0 max-w-[40ch] truncate font-heading text-sm font-medium text-foreground"
        >
          {name}
        </span>
      )}

      {/* Save status hugs the right edge of the filename. Icon-only;
       *  the full label survives in the tooltip / aria-label. */}
      <SaveStatusBadge
        readOnly={readOnly}
        status={status}
        errorMessage={errorMessage}
        onSaveNow={onSaveNow}
      />

      {/* Flex spacer — pushes the right cluster to the edge. */}
      <div className="flex-1" />

      {/* ─── Right cluster: quick toggles + overflow menu ──────────── */}
      <div className="flex items-center gap-0.5">
        <WidthQuickToggle />
        <FontQuickToggle />
        <ThemeQuickToggle />
        {showOverflow ? (
          <>
            <span aria-hidden className="mx-0.5 h-5 w-px bg-border/60" />
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button variant="ghost" size="icon" aria-label="More actions">
                    <HugeiconsIcon icon={Menu01Icon} strokeWidth={1.8} className="size-4" />
                  </Button>
                }
              />
              <DropdownMenuContent align="end" className="min-w-[12rem]">
                {!readOnly && onRequestRename ? (
                  <DropdownMenuItem onClick={onRequestRename}>
                    <HugeiconsIcon icon={Edit02Icon} strokeWidth={1.8} />
                    Rename
                  </DropdownMenuItem>
                ) : null}
                {!readOnly && onTags ? (
                  <DropdownMenuItem onClick={onTags}>
                    <HugeiconsIcon icon={HashtagIcon} strokeWidth={1.8} />
                    Tags
                  </DropdownMenuItem>
                ) : null}
                {!readOnly && onShare ? (
                  <DropdownMenuItem onClick={onShare}>
                    <HugeiconsIcon icon={Share08Icon} strokeWidth={1.8} />
                    Share
                  </DropdownMenuItem>
                ) : null}
                {(!readOnly || allowDownload) && (!readOnly || onTags || onShare) ? (
                  <DropdownMenuSeparator />
                ) : null}
                {!readOnly || allowDownload ? (
                  <>
                    <DropdownMenuItem onClick={onDownload}>
                      <HugeiconsIcon icon={Download01Icon} strokeWidth={1.8} />
                      Download
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={onExportMarkdown}>
                      <HugeiconsIcon icon={FileExportIcon} strokeWidth={1.8} />
                      Export as Markdown
                    </DropdownMenuItem>
                  </>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        ) : null}
      </div>
    </div>
  );
}

// ─── Quick-toggle buttons ────────────────────────────────────────────────────

function WidthQuickToggle() {
  const { width, setWidth } = useNotesPreferences();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="ghost" size="icon" aria-label="Editor width" title="Editor width">
            <HugeiconsIcon icon={Layout01Icon} strokeWidth={1.8} className="size-4" />
          </Button>
        }
      />
      <DropdownMenuContent align="end" className="min-w-[10rem]">
        <DropdownMenuRadioGroup
          value={width}
          onValueChange={(v) => setWidth(v as NotesEditorWidth)}
        >
          {NOTES_WIDTHS.map((opt) => (
            <DropdownMenuRadioItem key={opt.value} value={opt.value}>
              {opt.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function FontQuickToggle() {
  const { font, setFont } = useNotesPreferences();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="ghost" size="icon" aria-label="Editor font" title="Editor font">
            <HugeiconsIcon icon={TextFontIcon} strokeWidth={1.8} className="size-4" />
          </Button>
        }
      />
      <DropdownMenuContent align="end" className="min-w-[14rem]">
        <DropdownMenuRadioGroup value={font} onValueChange={(v) => setFont(v as NotesEditorFont)}>
          {NOTES_FONTS.map((opt) => (
            <DropdownMenuRadioItem
              key={opt.value}
              value={opt.value}
              // Preview each option in its own face — once the font has
              // loaded once (lazy-loaded on first selection), Chrome
              // and Firefox will use it here on subsequent renders.
              style={{ fontFamily: opt.stack }}
            >
              <span className="flex-1">{opt.label}</span>
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                {opt.family}
              </span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

const THEME_ITEMS: ReadonlyArray<{ value: ThemeMode; label: string; icon: typeof SunIcon }> = [
  { value: "light", label: "Light", icon: SunIcon },
  { value: "dark", label: "Dark", icon: Moon02Icon },
  { value: "system", label: "System", icon: ComputerIcon },
];

function ThemeQuickToggle() {
  const { mode, resolved, setMode } = useTheme();
  // Show the *applied* theme glyph; the menu still lets the user pick
  // "system" explicitly (which falls back to the OS preference).
  const displayedIcon = resolved === "dark" ? Moon02Icon : SunIcon;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="ghost" size="icon" aria-label="Theme" title="Theme">
            <HugeiconsIcon icon={displayedIcon} strokeWidth={1.8} className="size-4" />
          </Button>
        }
      />
      <DropdownMenuContent align="end" className="min-w-[10rem]">
        <DropdownMenuRadioGroup value={mode} onValueChange={(v) => setMode(v as ThemeMode)}>
          {THEME_ITEMS.map((opt) => (
            <DropdownMenuRadioItem key={opt.value} value={opt.value}>
              <HugeiconsIcon icon={opt.icon} strokeWidth={1.8} />
              {opt.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ─── Save status (left side) ─────────────────────────────────────────────────

// Compact, icon-only save indicator. Renders as a square chip the
// same height as the logo button so the left cluster reads as a
// single visual group. The full label survives in the `title` /
// `aria-label` for tooltip + screen-reader access; on dirty/error
// the chip is a real <button> that triggers an immediate save.
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
  const baseChip = cn(
    "inline-flex size-8 shrink-0 items-center justify-center rounded-md",
    "[&_svg]:size-4",
  );

  if (readOnly) {
    return (
      <span
        role="img"
        aria-label="View-only"
        className={cn(baseChip, "text-muted-foreground")}
        title="View-only"
      >
        <HugeiconsIcon icon={EyeIcon} strokeWidth={1.8} />
      </span>
    );
  }

  let label: string;
  let icon: ReactNode;
  let tone = "text-muted-foreground";
  switch (status) {
    case "saving":
      label = "Saving…";
      icon = <HugeiconsIcon icon={Loading03Icon} strokeWidth={1.8} className="animate-spin" />;
      tone = "text-foreground";
      break;
    case "dirty":
      label = "Save now";
      icon = <HugeiconsIcon icon={FloppyDiskIcon} strokeWidth={1.8} />;
      tone = "text-foreground";
      break;
    case "error":
      label = errorMessage || "Save failed — retry";
      icon = <HugeiconsIcon icon={Alert02Icon} strokeWidth={1.8} />;
      tone = "text-destructive";
      break;
    default:
      label = "Saved";
      icon = <HugeiconsIcon icon={CheckmarkCircle02Icon} strokeWidth={1.8} />;
      tone = "text-chart-5";
  }

  const interactive = (status === "dirty" || status === "error") && !!onSaveNow;
  if (interactive) {
    return (
      <button
        type="button"
        onClick={onSaveNow ?? undefined}
        className={cn(baseChip, "transition-colors hover:bg-muted", tone)}
        title={label}
        aria-label={label}
      >
        {icon}
      </button>
    );
  }
  return (
    <span role="status" aria-label={label} className={cn(baseChip, tone)} title={label}>
      {icon}
    </span>
  );
}
