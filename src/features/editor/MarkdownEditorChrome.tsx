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
  type MarkdownEditorLayout,
  NOTES_FONTS,
  NOTES_WIDTHS,
  type NotesEditorFont,
  type NotesEditorWidth,
  useNotesPreferences,
} from "./notes/preferences";

const LAYOUTS: ReadonlyArray<{ value: MarkdownEditorLayout; label: string }> = [
  { value: "source", label: "Source" },
  { value: "split", label: "Split" },
  { value: "preview", label: "Preview" },
];

export function MarkdownEditorChrome() {
  const { layout, setLayout } = useNotesPreferences();
  return (
    <div className="flex items-center gap-0.5" role="toolbar" aria-label="Markdown view">
      <div className="sm:hidden">
        <LayoutQuickToggle />
      </div>
      <div className="mr-1 hidden items-center rounded-md border p-0.5 sm:flex">
        {LAYOUTS.map((item) => (
          <Button
            key={item.value}
            variant={layout === item.value ? "secondary" : "ghost"}
            size="sm"
            className="h-7 px-2 text-xs"
            aria-pressed={layout === item.value}
            onClick={() => setLayout(item.value)}
          >
            {item.label}
          </Button>
        ))}
      </div>
      <div className="hidden sm:contents">
        <WidthQuickToggle />
        <FontQuickToggle />
      </div>
      <ThemeQuickToggle />
    </div>
  );
}

function LayoutQuickToggle() {
  const { layout, setLayout } = useNotesPreferences();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="ghost" size="icon" aria-label="Markdown view" title="Markdown view">
            <HugeiconsIcon icon={Layout01Icon} strokeWidth={1.8} className="size-4" />
          </Button>
        }
      />
      <DropdownMenuContent align="end" className="min-w-[9rem]">
        <DropdownMenuRadioGroup
          value={layout}
          onValueChange={(value) => setLayout(value as MarkdownEditorLayout)}
        >
          {LAYOUTS.map((option) => (
            <DropdownMenuRadioItem key={option.value} value={option.value}>
              {option.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

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
          {NOTES_WIDTHS.map((option) => (
            <DropdownMenuRadioItem key={option.value} value={option.value}>
              {option.label}
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
          <Button variant="ghost" size="icon" aria-label="Markdown font" title="Markdown font">
            <HugeiconsIcon icon={TextFontIcon} strokeWidth={1.8} className="size-4" />
          </Button>
        }
      />
      <DropdownMenuContent align="end" className="min-w-[14rem]">
        <DropdownMenuRadioGroup value={font} onValueChange={(v) => setFont(v as NotesEditorFont)}>
          {NOTES_FONTS.map((option) => (
            <DropdownMenuRadioItem
              key={option.value}
              value={option.value}
              style={{ fontFamily: option.stack }}
            >
              <span className="flex-1">{option.label}</span>
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                {option.family}
              </span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

const THEMES: ReadonlyArray<{ value: ThemeMode; label: string; icon: typeof SunIcon }> = [
  { value: "light", label: "Light", icon: SunIcon },
  { value: "dark", label: "Dark", icon: Moon02Icon },
  { value: "system", label: "System", icon: ComputerIcon },
];

function ThemeQuickToggle() {
  const { mode, resolved, setMode } = useTheme();
  const icon = resolved === "dark" ? Moon02Icon : SunIcon;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="ghost" size="icon" aria-label="Theme" title="Theme">
            <HugeiconsIcon icon={icon} strokeWidth={1.8} className="size-4" />
          </Button>
        }
      />
      <DropdownMenuContent align="end" className="min-w-[10rem]">
        <DropdownMenuRadioGroup value={mode} onValueChange={(v) => setMode(v as ThemeMode)}>
          {THEMES.map((option) => (
            <DropdownMenuRadioItem key={option.value} value={option.value}>
              <HugeiconsIcon icon={option.icon} strokeWidth={1.8} />
              {option.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
