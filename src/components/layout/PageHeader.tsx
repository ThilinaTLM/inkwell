// PageHeader — the title block at the top of every dashboard page.
//
// One geometry for all of them: optional leading node (breadcrumb),
// then a row with title + description on the left and actions on the
// right. Replaces the old `AppPageHeader` / `SectionHeading` pair.

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface PageHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  /** Rendered above the title — typically a `<Breadcrumb variant="compact">`. */
  above?: ReactNode;
  actions?: ReactNode;
  className?: string;
}

export function PageHeader({ title, description, above, actions, className }: PageHeaderProps) {
  return (
    <header className={cn("flex flex-col gap-2", className)}>
      {above ? <div className="min-w-0">{above}</div> : null}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="truncate text-lg font-semibold tracking-tight text-foreground">{title}</h1>
          {description ? (
            <p className="mt-0.5 truncate text-xs text-muted-foreground">{description}</p>
          ) : null}
        </div>
        {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
      </div>
    </header>
  );
}

/** Smaller heading used for sections inside a page (Home rows, Settings cards). */
export function SectionHeader({
  title,
  description,
  actions,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-end justify-between gap-3", className)}>
      <div className="min-w-0">
        <h2 className="text-sm font-semibold tracking-tight text-foreground">{title}</h2>
        {description ? <p className="mt-0.5 text-xs text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-1.5">{actions}</div> : null}
    </div>
  );
}
