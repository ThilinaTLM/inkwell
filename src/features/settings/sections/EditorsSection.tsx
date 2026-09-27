// Settings → Editors: draw.io style (src/lib/preferences) and the Notes
// width / typeface (src/features/editor/notes/preferences — imported, not
// edited).

import {
  NOTES_FONTS,
  NOTES_WIDTHS,
  type NotesEditorFont,
  type NotesEditorWidth,
  useNotesPreferences,
} from "@/features/editor/notes/preferences";
import { type DrawioStylePref, useDrawioStylePref } from "@/lib/preferences";
import { Segmented, SettingRow, SettingsGroup } from "../controls";

export function EditorsSection() {
  const [drawio, setDrawio] = useDrawioStylePref();
  const notes = useNotesPreferences();
  return (
    <>
      <SettingsGroup title="draw.io" description="Takes effect when you next open a diagram.">
        <SettingRow
          label="Editor style"
          help={
            drawio === "auto"
              ? "Sketch on touch devices, classic elsewhere"
              : drawio === "classic"
                ? "Menus and side panels"
                : "Touch-optimised floating toolbar"
          }
        >
          <Segmented<DrawioStylePref>
            ariaLabel="draw.io editor style"
            value={drawio}
            onChange={setDrawio}
            options={[
              { value: "auto", label: "Auto" },
              { value: "classic", label: "Classic" },
              { value: "sketch", label: "Sketch" },
            ]}
          />
        </SettingRow>
      </SettingsGroup>
      <SettingsGroup title="Notes" description="Reading preferences; per device, not per document.">
        <SettingRow label="Content width">
          <Segmented<NotesEditorWidth>
            ariaLabel="Notes content width"
            value={notes.width}
            onChange={notes.setWidth}
            options={NOTES_WIDTHS.map((w) => ({ value: w.value, label: w.label }))}
          />
        </SettingRow>
        <SettingRow label="Typeface" help="Fonts load the first time you open a note">
          <select
            aria-label="Notes typeface"
            value={notes.font}
            onChange={(e) => notes.setFont(e.target.value as NotesEditorFont)}
            className="h-8 rounded-md border border-input bg-background px-2 text-[13px] text-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/20"
          >
            {NOTES_FONTS.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label} · {f.family}
              </option>
            ))}
          </select>
          <span
            className="text-[13px]"
            style={{ fontFamily: NOTES_FONTS.find((f) => f.value === notes.font)?.stack }}
          >
            The quick brown fox
          </span>
        </SettingRow>
      </SettingsGroup>
    </>
  );
}
