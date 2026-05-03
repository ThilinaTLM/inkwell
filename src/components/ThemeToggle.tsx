// ThemeToggle — Topbar-resident theme switcher.
//
// Three-state dropdown (Light / Dark / System) matching shadcn's
// canonical theme-toggle pattern. The trigger renders a sun or moon
// glyph based on the *resolved* theme so users always see what's
// currently applied; the dropdown itself shows a checkmark next to
// the active *mode* (which may be "system" even when resolved is
// dark/light).
//
// Visual style mirrors the admin "Users" button in ExplorerHeader
// so the Topbar reads as one consistent action cluster.

import { HugeiconsIcon } from "@hugeicons/react";
import {
  LaptopIcon,
  Moon02Icon,
  Sun03Icon,
} from "@hugeicons/core-free-icons";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useTheme, type ThemeMode } from "@/lib/theme";
import { cn } from "@/lib/utils";

export function ThemeToggle({ className }: { className?: string }) {
  const { mode, resolved, setMode } = useTheme();

  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger
          render={
            <DropdownMenuTrigger
              render={
                <button
                  type="button"
                  aria-label="Toggle theme"
                  className={cn(
                    "grid size-8 place-items-center rounded-md text-ink-soft transition-colors hover:bg-manila-soft/50 hover:text-ink",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
                    className,
                  )}
                />
              }
            />
          }
        >
          <HugeiconsIcon
            icon={resolved === "dark" ? Moon02Icon : Sun03Icon}
            strokeWidth={1.7}
            className="size-4"
          />
        </TooltipTrigger>
        <TooltipContent>Theme</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end" sideOffset={6} className="min-w-40">
        <DropdownMenuRadioGroup
          value={mode}
          onValueChange={(v) => setMode(v as ThemeMode)}
        >
          <DropdownMenuRadioItem value="light">
            <HugeiconsIcon
              icon={Sun03Icon}
              strokeWidth={1.8}
              className="size-3.5"
            />
            Light
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="dark">
            <HugeiconsIcon
              icon={Moon02Icon}
              strokeWidth={1.8}
              className="size-3.5"
            />
            Dark
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="system">
            <HugeiconsIcon
              icon={LaptopIcon}
              strokeWidth={1.8}
              className="size-3.5"
            />
            System
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
