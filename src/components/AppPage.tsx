// AppPage / AppPageHeader — shared shell for authenticated settings-style
// pages (Settings, Shared Links, Users).
//
// These pages share the same outer geometry: paper background, sticky
// Topbar, a centered `<main>` column, and a page header with optional
// back link, icon, title, description, and right-aligned actions.
//
// Theme switching deliberately lives only on the Settings page; pages
// that want extra topbar actions (e.g. ExplorerHeader) opt in via
// `actions`.
//
// Specialised surfaces (Dashboard, Editor) intentionally do NOT use
// this component — they own their own dense layouts.

import { ArrowLeft01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { ComponentType, ReactNode } from "react";
import { Link } from "react-router-dom";
import { PaperSurface } from "@/components/PaperSurface";
import { Topbar } from "@/components/Topbar";
import { Button } from "@/components/ui/button";
import type { User } from "@/lib/api/client";
import { cn } from "@/lib/utils";

interface AppPageProps {
  user: User;
  children: ReactNode;
  /** Right-side topbar actions. Empty by default. */
  actions?: ReactNode;
  /** Class names applied to the outer `<PaperSurface>`. */
  className?: string;
  /** Class names applied to the centered `<main>` column. */
  mainClassName?: string;
  /** Centered max width for the page column. Defaults to `max-w-5xl`. */
  maxWidth?: string;
}

/**
 * Authenticated page shell shared by Account, Shared Links, and Users.
 *
 * Provides the paper surface, sticky Topbar, and a centered main column
 * with consistent padding so settings-style pages line up across the app.
 */
export function AppPage({
  user,
  children,
  actions,
  className,
  mainClassName,
  maxWidth = "max-w-5xl",
}: AppPageProps) {
  return (
    <PaperSurface variant="page" className={cn("flex flex-col", className)}>
      <Topbar user={user} actions={actions} />
      <main
        className={cn("mx-auto w-full flex-1 px-4 py-8 sm:px-6 sm:py-10", maxWidth, mainClassName)}
      >
        {children}
      </main>
    </PaperSurface>
  );
}

interface AppPageHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  /** Hugeicons icon component rendered next to the title. */
  icon?: ComponentType<{ strokeWidth?: number }> | unknown;
  /** Path for an optional ghost back button rendered above the title. */
  backTo?: string;
  /** Label for the back button. Defaults to "Back". */
  backLabel?: string;
  /** Right-aligned action area (buttons, badges, etc.). */
  actions?: ReactNode;
  className?: string;
}

/**
 * Header block used at the top of an `AppPage`. Renders an optional
 * back link, then a row with title + description on the left and
 * actions on the right.
 */
export function AppPageHeader({
  title,
  description,
  icon,
  backTo,
  backLabel = "Back",
  actions,
  className,
}: AppPageHeaderProps) {
  return (
    <header className={cn("mb-6 sm:mb-8", className)}>
      {backTo ? (
        <Button
          variant="ghost"
          size="sm"
          render={<Link to={backTo} />}
          className="-ml-2 mb-2 text-muted-foreground"
        >
          <HugeiconsIcon icon={ArrowLeft01Icon} strokeWidth={2} />
          {backLabel}
        </Button>
      ) : null}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2.5 font-heading text-3xl font-semibold text-foreground">
            {icon ? (
              <HugeiconsIcon
                // biome-ignore lint/suspicious/noExplicitAny: icon shape comes from @hugeicons/core-free-icons
                icon={icon as any}
                strokeWidth={2}
                className="size-7"
              />
            ) : null}
            <span className="truncate">{title}</span>
          </h1>
          {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
    </header>
  );
}
