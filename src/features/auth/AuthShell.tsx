// AuthShell — centered single-card layout for unauthenticated routes
// (Login, InviteAccept). A clean elevated card with the brand lockup
// and a display-serif title, centered on the flat page background.

import type { ReactNode } from "react";
import { InkwellLogo } from "@/components/InkwellLogo";
import { Surface } from "@/components/Surface";
import { cn } from "@/lib/utils";

interface AuthShellProps {
  title?: ReactNode;
  description?: ReactNode;
  /** Small print under the card body (inside the card). */
  footer?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function AuthShell({ title, description, footer, children, className }: AuthShellProps) {
  return (
    <Surface variant="page" className="grid place-items-center overflow-hidden px-4 py-10">
      <main className="relative z-10 w-full max-w-[24rem]">
        <div
          className={cn(
            "relative rounded-xl border border-border bg-card p-7 text-card-foreground",
            "shadow-[0_8px_30px_-12px_rgba(28,24,20,0.18)] dark:shadow-[0_18px_40px_-14px_rgba(0,0,0,0.55)]",
            className,
          )}
        >
          <div className="mb-4 flex items-center text-foreground">
            <InkwellLogo />
          </div>

          {(title || description) && (
            <div className="mb-5 flex flex-col gap-0.5">
              {title && (
                <h1 className="font-display text-[28px] leading-tight font-medium text-foreground">
                  {title}
                </h1>
              )}
              {description && <p className="text-sm text-muted-foreground">{description}</p>}
            </div>
          )}

          {children}

          {footer && (
            <div className="mt-4 text-center text-xs text-muted-foreground/80">{footer}</div>
          )}
        </div>
      </main>
    </Surface>
  );
}
