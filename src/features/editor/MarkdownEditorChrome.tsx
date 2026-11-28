// Markdown toolbar slot: one Write / Source segmented control
// and a single "Aa" popover for reading width, typeface and theme
// (replaces the previous three dropdowns that shared one icon).

import { Popover as PopoverPrimitive } from "@base-ui/react/popover";
import { ComputerIcon, Moon02Icon, SunIcon, TextFontIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/segmented";
import { type ThemeMode, useTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";
import {
  type MarkdownEditorMode,
  NOTES_WIDTHS,
  type NotesEditorFont,
  type NotesEditorWidth,
  useNotesPreferences,
} from "./notes/preferences";

const MODES: ReadonlyArray<{ value: MarkdownEditorMode; label: string; hint: string }> = [
  { value: "write", label: "Write", hint: "Rich text editing" },
  { value: "source", label: "Source", hint: "Raw Markdown" },
];

// Curated roster (design direction: Inter UI + Source Serif for
// reading). Other stored values still render; they just aren't offered.
const FONT_CHOICES: ReadonlyArray<{ value: NotesEditorFont; label: string; sample: string }> = [
  { value: "inter", label: "Sans", sample: "Aa" },
  { value: "source-serif", label: "Serif", sample: "Aa" },
  { value: "jetbrains-mono", label: "Mono", sample: "Aa" },
];

const THEMES: ReadonlyArray<{ value: ThemeMode; label: string; icon: typeof SunIcon }> = [
  { value: "light", label: "Light", icon: SunIcon },
  { value: "dark", label: "Dark", icon: Moon02Icon },
  { value: "system", label: "System", icon: ComputerIcon },
];

export function MarkdownEditorChrome() {
  const { mode, setMode } = useNotesPreferences();
  return (
    <div className="flex items-center gap-1.5" role="toolbar" aria-label="Markdown view">
      <Segmented<MarkdownEditorMode>
        ariaLabel="Editor view"
        value={mode}
        onChange={setMode}
        options={MODES.map((item) => ({
          value: item.value,
          title: item.hint,
          // The shared control has no per-option test ids; clicks bubble.
          label: <span data-testid={`markdown-mode-${item.value}`}>{item.label}</span>,
        }))}
      />
      <DisplayPopover />
    </div>
  );
}

function PrefSegmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: ReadonlyArray<{ value: T; label: string; icon?: typeof SunIcon }>;
  onChange: (v: T) => void;
}) {
  return (
    <div className="space-y-1.5">
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <div className="grid auto-cols-fr grid-flow-col gap-1 rounded-lg bg-muted p-0.5">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            aria-pressed={value === o.value}
            onClick={() => onChange(o.value)}
            className={cn(
              "inline-flex h-7 items-center justify-center gap-1 rounded-md px-2 text-xs text-muted-foreground transition-colors",
              "hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
              value === o.value && "bg-background font-medium text-foreground shadow-xs",
            )}
          >
            {o.icon ? <HugeiconsIcon icon={o.icon} strokeWidth={1.8} className="size-3.5" /> : null}
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function DisplayPopover() {
  const { width, setWidth, font, setFont } = useNotesPreferences();
  const { mode, setMode } = useTheme();
  return (
    <PopoverPrimitive.Root>
      <PopoverPrimitive.Trigger
        render={
          <Button
            variant="ghost"
            size="icon"
            aria-label="Display options"
            title="Width, font and theme"
            data-testid="markdown-display"
            className="focus-visible:ring-1 focus-visible:ring-ring/35"
          >
            <HugeiconsIcon icon={TextFontIcon} strokeWidth={1.8} className="size-4" />
          </Button>
        }
      />
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Positioner align="end" sideOffset={6} className="isolate z-50">
          <PopoverPrimitive.Popup
            aria-label="Display options"
            className="w-72 space-y-3 rounded-xl bg-popover p-3 text-popover-foreground shadow-[0_18px_40px_-14px_rgba(28,24,20,0.35)] ring-1 ring-border outline-none data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95"
          >
            <PrefSegmented<NotesEditorWidth>
              label="Width"
              value={width}
              options={NOTES_WIDTHS.map((w) => ({
                value: w.value,
                label: w.value === "full" ? "Full" : w.label,
              }))}
              onChange={setWidth}
            />
            <PrefSegmented<NotesEditorFont>
              label="Font"
              value={FONT_CHOICES.some((f) => f.value === font) ? font : "inter"}
              options={FONT_CHOICES}
              onChange={setFont}
            />
            <PrefSegmented<ThemeMode>
              label="Theme"
              value={mode}
              options={THEMES}
              onChange={setMode}
            />
          </PopoverPrimitive.Popup>
        </PopoverPrimitive.Positioner>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
