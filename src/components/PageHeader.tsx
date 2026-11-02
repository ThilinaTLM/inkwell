// Page header for the redesigned shell (no top bar): Fraunces title,
// optional leading icon tile, subtitle, right-side actions and an
// optional breadcrumb above the title.
//
// PUBLIC CONTRACT
//   <PageContainer className?>…</PageContainer>
//        – scrollable page body (fills <main>), centred max-width column.
//   <PageHeader
//      title            ReactNode   – rendered in an <h1> (Fraunces)
//      icon?            ReactNode   – leading tile, e.g. <ProjectIcon size="lg" />
//      subtitle?        ReactNode   – muted line under the title
//      actions?         ReactNode   – right-aligned (wraps below on narrow screens)
//      breadcrumb?      Crumb[]     – [{ label, to? }]; last crumb is the current page
//      className?
//   />
//   When the desktop sidebar is collapsed (or on mobile) a sidebar toggle is
//   shown at the start of the header so the nav is always reachable.

import { ArrowRight01Icon, Menu01Icon, SidebarLeftIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { toggleSidebar, useShellState } from "@/components/shell/shellStore";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface Crumb {
  label: string;
  to?: string;
}

export function PageContainer({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
      <div
        className={cn(
          "mx-auto w-full max-w-[1120px] px-4 pt-5 pb-8 sm:px-8 md:pt-8 md:pb-12",
          className,
        )}
      >
        {children}
      </div>
    </div>
  );
}

export interface PageHeaderProps {
  title: ReactNode;
  icon?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  breadcrumb?: Crumb[];
  className?: string;
}

export function PageHeader({
  title,
  icon,
  subtitle,
  actions,
  breadcrumb,
  className,
}: PageHeaderProps) {
  const isMobile = useShellState((s) => s.isMobile);
  const sidebarOpen = useShellState((s) => s.sidebarOpen);
  const showToggle = isMobile || !sidebarOpen;
  return (
    <header className={cn("mb-6 flex flex-col gap-3", className)}>
      {breadcrumb?.length ? <Breadcrumb items={breadcrumb} /> : null}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <div className="flex min-w-0 flex-1 basis-64 items-center gap-3.5">
          {showToggle ? (
            <Button
              variant="ghost"
              size="icon"
              aria-label={isMobile ? "Open navigation" : "Show sidebar"}
              onClick={toggleSidebar}
              className="-ml-1 shrink-0 text-muted-foreground"
            >
              <HugeiconsIcon icon={isMobile ? Menu01Icon : SidebarLeftIcon} strokeWidth={1.8} />
            </Button>
          ) : null}
          {icon}
          <div className="min-w-0">
            <h1 className="truncate font-display text-[26px] leading-[1.15] font-medium tracking-tight text-foreground md:text-[30px]">
              {title}
            </h1>
            {subtitle ? (
              <div className="mt-0.5 truncate text-[13px] text-muted-foreground">{subtitle}</div>
            ) : null}
          </div>
        </div>
        {actions ? (
          <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
        ) : null}
      </div>
    </header>
  );
}

function Breadcrumb({ items }: { items: Crumb[] }) {
  return (
    <nav aria-label="Breadcrumb" className="min-w-0">
      <ol className="flex min-w-0 flex-wrap items-center gap-1 text-[13px] text-muted-foreground">
        {items.map((c, i) => {
          const last = i === items.length - 1;
          return (
            <li key={c.to ?? `current:${c.label}`} className="flex min-w-0 items-center gap-1">
              {i > 0 ? (
                <HugeiconsIcon
                  icon={ArrowRight01Icon}
                  strokeWidth={2}
                  className="size-3 shrink-0 text-faint"
                />
              ) : null}
              {c.to && !last ? (
                <Link
                  to={c.to}
                  data-drop-folder={c.to.startsWith("/folders/") ? c.to.slice(9) : undefined}
                  className="max-w-48 truncate rounded px-1 py-0.5 hover:bg-accent hover:text-foreground"
                >
                  {c.label}
                </Link>
              ) : (
                <span
                  aria-current={last ? "page" : undefined}
                  className={cn("max-w-56 truncate px-1", last && "font-medium text-foreground")}
                >
                  {c.label}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
