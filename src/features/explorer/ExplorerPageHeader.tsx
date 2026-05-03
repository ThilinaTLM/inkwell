// ExplorerPageHeader — page-level header for explorer views.
//
// Sits below the global `<ExplorerHeader>` (logo + avatar) and above
// the content body. Renders, in order:
//
//   [ title ]            [ toolbar ] [ secondary ] [ primary ]
//   [ subtitle ]
//
// `title` accepts a `ReactNode` so callers can pass either a plain
// string or a richer node like a heading-variant breadcrumb (Browse,
// where the breadcrumb itself is the page title).

import type { ReactNode } from "react";

interface ExplorerPageHeaderProps {
  title: ReactNode;
  subtitle?: string;
  /** Tertiary controls. Rendered before action buttons. */
  toolbar?: ReactNode;
  /** Outline-style action button. Rendered to the left of `primaryAction`. */
  secondaryAction?: ReactNode;
  /** Solid primary CTA. Rightmost in the actions row. */
  primaryAction?: ReactNode;
}

export function ExplorerPageHeader({
  title,
  subtitle,
  toolbar,
  secondaryAction,
  primaryAction,
}: ExplorerPageHeaderProps) {
  const hasActions = !!(toolbar || secondaryAction || primaryAction);
  return (
    <header className="px-6 pt-4 pb-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          {typeof title === "string" ? (
            <h1 className="truncate font-heading text-2xl text-foreground">{title}</h1>
          ) : (
            <h1 className="min-w-0">{title}</h1>
          )}
          {subtitle ? <p className="mt-0.5 text-sm text-muted-foreground/70">{subtitle}</p> : null}
        </div>
        {hasActions ? (
          <div className="flex flex-wrap items-center gap-2">
            {toolbar}
            {secondaryAction}
            {primaryAction}
          </div>
        ) : null}
      </div>
    </header>
  );
}
