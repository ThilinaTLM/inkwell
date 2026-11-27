import { MainMenu } from "@excalidraw/excalidraw";
import type { ThemeMode } from "@/lib/theme";

interface ExcalidrawMenuProps {
  variant: "owner" | "shared";
  theme: ThemeMode;
  onSelectTheme: (theme: ThemeMode) => void;
}

export default function ExcalidrawMenu({ variant, theme, onSelectTheme }: ExcalidrawMenuProps) {
  if (variant === "shared") {
    return (
      <MainMenu>
        {/* Share permission, back, export and download live in the header. */}
        <MainMenu.DefaultItems.ToggleTheme
          allowSystemTheme
          theme={theme}
          onSelect={onSelectTheme}
        />
        <MainMenu.DefaultItems.Help />
      </MainMenu>
    );
  }

  return (
    <MainMenu>
      {/* File-level actions (export, save, rename…) live in the editor header. */}
      <MainMenu.DefaultItems.ToggleTheme allowSystemTheme theme={theme} onSelect={onSelectTheme} />
      <MainMenu.DefaultItems.Help />
    </MainMenu>
  );
}
