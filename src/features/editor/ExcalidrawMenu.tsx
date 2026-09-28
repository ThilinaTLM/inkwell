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
        {/* Share permission, back and download live in the header. */}
        <MainMenu.DefaultItems.ToggleTheme
          allowSystemTheme
          theme={theme}
          onSelect={onSelectTheme}
        />
        <MainMenu.DefaultItems.SaveAsImage />
        <MainMenu.DefaultItems.Help />
      </MainMenu>
    );
  }

  return (
    <MainMenu>
      {/* File-level actions live in the editor header. */}
      <MainMenu.DefaultItems.SaveAsImage />
      <MainMenu.Separator />
      <MainMenu.DefaultItems.ToggleTheme allowSystemTheme theme={theme} onSelect={onSelectTheme} />
      <MainMenu.DefaultItems.ClearCanvas />
      <MainMenu.DefaultItems.Help />
    </MainMenu>
  );
}
