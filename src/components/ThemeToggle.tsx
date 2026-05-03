// ThemeToggle — Topbar-resident theme cycler.
//
// Click to cycle: light → dark → system → light.
// Icon reflects current *mode* so users see what they'll switch away from:
//   light  → sun
//   dark   → moon
//   system → laptop

import { LaptopIcon, Moon02Icon, Sun03Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import { type ThemeMode, useTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";

const MODE_ICON: Record<ThemeMode, typeof Sun03Icon> = {
  light: Sun03Icon,
  dark: Moon02Icon,
  system: LaptopIcon,
};

const MODE_LABEL: Record<ThemeMode, string> = {
  light: "Light",
  dark: "Dark",
  system: "System",
};

export function ThemeToggle({ className }: { className?: string }) {
  const { mode, cycle } = useTheme();

  return (
    <button
      type="button"
      aria-label={`Theme: ${MODE_LABEL[mode]}. Click to switch.`}
      title={MODE_LABEL[mode]}
      onClick={cycle}
      className={cn(
        "grid size-8 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
        className,
      )}
    >
      <HugeiconsIcon icon={MODE_ICON[mode]} strokeWidth={1.7} className="size-4" />
    </button>
  );
}
