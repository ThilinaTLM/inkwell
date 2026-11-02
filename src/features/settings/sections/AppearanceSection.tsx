// Settings → Appearance: colour theme and note typeface (both device-local).
// The note font reuses the markdown editor's stored preference
// (`inkwell:notes:font`) via useNotesPreferences: Sans = Inter, Serif =
// Source Serif. The draw.io style stays on its default ("auto") with no UI.

import { Segmented } from "@/components/ui/segmented";
import { NOTES_FONTS, useNotesPreferences } from "@/features/editor/notes/preferences";
import { type ThemeMode, useTheme } from "@/lib/theme";
import { Row, SettingsCard } from "../SettingsCard";

type NoteFontKind = "sans" | "serif";

export function AppearanceSection() {
  const { mode, setMode, resolved } = useTheme();
  const notes = useNotesPreferences();
  const current = NOTES_FONTS.find((f) => f.value === notes.font);
  const kind: NoteFontKind = current?.family === "Serif" ? "serif" : "sans";
  return (
    <SettingsCard id="appearance" title="Appearance" description="Stored on this device.">
      <Row
        label="Theme"
        help={mode === "system" ? `Following your system (${resolved})` : undefined}
      >
        <Segmented<ThemeMode>
          ariaLabel="Theme"
          value={mode}
          onChange={setMode}
          options={[
            { value: "light", label: "Light" },
            { value: "dark", label: "Dark" },
            { value: "system", label: "System" },
          ]}
        />
      </Row>
      <Row label="Note font" help="Used when reading and writing Markdown notes.">
        <Segmented<NoteFontKind>
          ariaLabel="Note font"
          value={kind}
          onChange={(next) => notes.setFont(next === "serif" ? "source-serif" : "inter")}
          options={[
            { value: "sans", label: "Sans" },
            { value: "serif", label: "Serif" },
          ]}
        />
        <span className="text-sm text-muted-foreground" style={{ fontFamily: current?.stack }}>
          The quick brown fox
        </span>
      </Row>
    </SettingsCard>
  );
}
