// Settings → Appearance: theme (device-local) plus a pointer to editor
// styles, which live under Editors.

import { Link } from "react-router-dom";
import { useDrawioStylePref } from "@/lib/preferences";
import { type ThemeMode, useTheme } from "@/lib/theme";
import { Segmented, SettingRow, SettingsGroup } from "../controls";

export function AppearanceSection() {
  const { mode, setMode, resolved } = useTheme();
  const [drawio] = useDrawioStylePref();
  return (
    <SettingsGroup title="Theme" description="Stored on this device.">
      <SettingRow
        label="Color theme"
        help={mode === "system" ? `Following your OS (${resolved})` : undefined}
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
      </SettingRow>
      <SettingRow label="Editor style" help="draw.io chrome and Markdown typography">
        <span className="text-[13px] text-muted-foreground">
          draw.io: <b className="font-medium text-foreground">{drawio}</b>
        </span>
        <Link
          to="/settings/editors"
          className="text-xs text-primary underline-offset-4 hover:underline"
        >
          Configure in Editors →
        </Link>
      </SettingRow>
    </SettingsGroup>
  );
}
