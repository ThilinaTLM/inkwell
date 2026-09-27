// Shell top bar (wireframe `topbar()`): wordmark, global search trigger
// (opens the palette), uploads button with activity dot, shortcuts
// button, user menu. On mobile a hamburger opens the sidebar drawer.

import {
  KeyboardIcon,
  Menu01Icon,
  Search01Icon,
  SidebarLeftIcon,
  Upload01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Link } from "react-router-dom";
import { InkwellMark } from "@/components/InkwellMark";
import { UserMenu } from "@/components/UserMenu";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { toggleUploadTray, useUploadSummary } from "@/features/upload";
import type { User } from "@/lib/api/client";
import { formatKeys } from "@/lib/commands/keymap";
import { getEffectiveKeys, useRegistryVersion } from "@/lib/commands/registry";
import { cn } from "@/lib/utils";
import { CommandKeys } from "./Kbd";
import { openPalette, openShortcutSheet, toggleSidebar, useShellState } from "./shellStore";

export function TopBar({ user }: { user: User }) {
  useRegistryVersion();
  const isMobile = useShellState((s) => s.isMobile);
  const uploads = useUploadSummary();

  return (
    <header className="flex h-12 shrink-0 items-center gap-3 border-b border-border bg-card px-3.5">
      {isMobile ? (
        <Button variant="ghost" size="icon" aria-label="Open sidebar" onClick={toggleSidebar}>
          <HugeiconsIcon icon={Menu01Icon} strokeWidth={2} />
        </Button>
      ) : null}
      <div className="flex items-center gap-1 md:w-[204px]">
        {!isMobile ? (
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Toggle sidebar"
                  onClick={toggleSidebar}
                  className="text-muted-foreground"
                />
              }
            >
              <HugeiconsIcon icon={SidebarLeftIcon} strokeWidth={2} />
            </TooltipTrigger>
            <TooltipContent>
              Toggle sidebar ({formatKeys(getEffectiveKeys("view.sidebar"))})
            </TooltipContent>
          </Tooltip>
        ) : null}
        <Link
          to="/"
          aria-label="Inkwell home"
          className="flex items-center gap-2 font-brand text-[22px] leading-none text-foreground transition-opacity hover:opacity-75"
        >
          <InkwellMark className="size-5" />
          <span className="hidden sm:inline">inkwell</span>
        </Link>
      </div>

      <button
        type="button"
        onClick={() => openPalette()}
        className="mx-auto flex h-8 min-w-0 max-w-[560px] flex-1 items-center gap-2 rounded-lg border border-border bg-background px-2.5 text-[13px] text-muted-foreground transition-colors hover:border-foreground/25 hover:text-foreground"
        aria-label="Search files, folders, tags and commands"
      >
        <HugeiconsIcon icon={Search01Icon} strokeWidth={2} className="size-[15px] shrink-0" />
        <span className="flex-1 truncate text-left">
          <span className="hidden sm:inline">Search files, folders, tags, commands…</span>
          <span className="sm:hidden">Search…</span>
        </span>
        <CommandKeys id="app.palette" className="hidden sm:inline-flex" />
      </button>

      <div className="flex items-center gap-1.5">
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="icon"
                aria-label={uploads.active ? `Uploads (${uploads.active} active)` : "Uploads"}
                aria-pressed={uploads.open}
                onClick={() => toggleUploadTray()}
                className={cn(
                  "relative text-muted-foreground",
                  uploads.open && "bg-muted text-foreground",
                )}
              />
            }
          >
            <HugeiconsIcon icon={Upload01Icon} strokeWidth={2} />
            {uploads.active > 0 || uploads.hasErrors ? (
              <span
                aria-hidden
                className={cn(
                  "absolute top-1 right-1 size-[7px] rounded-full",
                  uploads.hasErrors ? "bg-destructive" : "animate-pulse bg-primary",
                )}
              />
            ) : null}
          </TooltipTrigger>
          <TooltipContent>
            {uploads.active
              ? `${uploads.active} upload${uploads.active > 1 ? "s" : ""} in progress`
              : uploads.total
                ? "Uploads"
                : "No uploads yet"}
          </TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="icon"
                aria-label="Keyboard shortcuts"
                onClick={openShortcutSheet}
                className="hidden text-muted-foreground sm:inline-flex"
              />
            }
          >
            <HugeiconsIcon icon={KeyboardIcon} strokeWidth={2} />
          </TooltipTrigger>
          <TooltipContent>
            Shortcuts ({formatKeys(getEffectiveKeys("app.shortcuts"))})
          </TooltipContent>
        </Tooltip>
        <UserMenu user={user} />
      </div>
    </header>
  );
}
