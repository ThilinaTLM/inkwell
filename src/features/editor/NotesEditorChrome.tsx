// NotesEditorChrome — the Notes editor's view controls.
//
// File-level chrome (back, breadcrumb, name, save state, rename /
// tags / share / download) lives in the shared `<EditorHeader>`; this
// component only renders the per-document presentation toggles that
// are specific to Notes, and is mounted in the header's toolbar slot
// via the editor bridge:
//
//   [width] [font] [theme]
//
// The width toggle is hidden below `sm` — its three presets (45rem /
// 60rem / full) are all wider than a phone viewport, so toggling them
// has no visible effect there.

import {
  ComputerIcon,
  Layout01Icon,
  Moon02Icon,
  SunIcon,
  TextFontIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { type ThemeMode, useTheme } from "@/lib/theme";
import {
  NOTES_FONTS,
  NOTES_WIDTHS,
  type NotesEditorFont,
  type NotesEditorWidth,
  useNotesPreferences,
} from "./notes/preferences";

export function NotesEditorChrome() {
  return (
    <div className="flex items-center gap-0.5" role="toolbar" aria-label="Notes view">
      <div className="hidden sm:contents">
        <WidthQuickToggle />
      </div>
      <FontQuickToggle />
      <ThemeQuickToggle />
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
