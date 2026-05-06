// PreferencesTab — appearance, drawio editor style, and default file
// kind. Three labelled groups in one card so the tab reads as a single
// settings panel rather than three islands.
//
// Every preference here is device-local (localStorage). Cross-device
// sync requires backend columns and is deferred. See
// `src/lib/preferences.ts` and `src/lib/theme.tsx` for the underlying
// hooks.

import { ElevatedCard } from "@/components/ElevatedCard";
import { Separator } from "@/components/ui/separator";
import type { FileKind } from "@/lib/api/client";
import { type DrawioStylePref, useDefaultFileKind, useDrawioStylePref } from "@/lib/preferences";
import { type ThemeMode, useTheme } from "@/lib/theme";
import { type SegmentedOption, SegmentedOptions } from "./SegmentedOptions";

const THEME_OPTIONS: ReadonlyArray<SegmentedOption<ThemeMode>> = [
  { value: "light", label: "Light", description: "Always light." },
  { value: "dark", label: "Dark", description: "Always dark." },
  { value: "system", label: "System", description: "Follows your OS." },
];

const DRAWIO_STYLE_OPTIONS: ReadonlyArray<SegmentedOption<DrawioStylePref>> = [
  {
    value: "auto",
    label: "Auto",
    description: "Sketch on touch devices, classic everywhere else.",
  },
  {
    value: "classic",
    label: "Classic",
    description: "Familiar drawio with menus and side panels.",
  },
  {
    value: "sketch",
    label: "Sketch",
    description: "Touch-optimised floating toolbar.",
  },
];

const FILE_KIND_OPTIONS: ReadonlyArray<SegmentedOption<FileKind>> = [
  {
    value: "excalidraw",
    label: "Excalidraw",
    description: "Hand-drawn whiteboard, fast and simple.",
  },
  {
    value: "drawio",
    label: "Draw.io",
    description: "Structured diagrams with shapes and connectors.",
  },
];

export function PreferencesTab() {
  const { mode, setMode } = useTheme();
  const [drawioStyle, setDrawioStyle] = useDrawioStylePref();
  const [defaultKind, setDefaultKind] = useDefaultFileKind();

  return (
    <ElevatedCard>
      <div className="flex flex-col gap-6 px-6 py-6">
        <PreferenceGroup title="Appearance" description="How Inkwell renders. Applies immediately.">
          <SegmentedOptions
            ariaLabel="Theme"
            value={mode}
            onChange={setMode}
            options={THEME_OPTIONS}
          />
        </PreferenceGroup>

        <Separator />

        <PreferenceGroup
          title="Editor style"
          description="How draw.io renders. Takes effect when you next open a diagram."
        >
          <SegmentedOptions
            ariaLabel="Editor style"
            value={drawioStyle}
            onChange={setDrawioStyle}
            options={DRAWIO_STYLE_OPTIONS}
          />
        </PreferenceGroup>

        <Separator />

        <PreferenceGroup
          title="Default file kind"
          description="Used by the New File button and right-click menus."
        >
          <SegmentedOptions
            ariaLabel="Default file kind"
            value={defaultKind}
            onChange={setDefaultKind}
            options={FILE_KIND_OPTIONS}
            columns={2}
          />
        </PreferenceGroup>
      </div>
    </ElevatedCard>
  );
}

interface PreferenceGroupProps {
  title: string;
  description: string;
  children: React.ReactNode;
}

function PreferenceGroup({ title, description, children }: PreferenceGroupProps) {
  return (
    <section className="flex flex-col gap-3">
      <header className="flex flex-col gap-1">
        <h3 className="font-heading text-sm font-semibold text-foreground">{title}</h3>
        <p className="text-xs text-muted-foreground">{description}</p>
      </header>
      {children}
    </section>
  );
}
