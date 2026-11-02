// AuthShell — centered single-card layout for unauthenticated routes
// (Login, InviteAccept). A clean elevated card with the brand lockup
// above it and a display-serif title, centered on the paper background.

import type { ReactNode } from "react";
import { InkwellLogo } from "@/components/InkwellLogo";
import { Surface } from "@/components/Surface";
import { cn } from "@/lib/utils";

interface AuthShellProps {
  title?: ReactNode;
  description?: ReactNode;
  /** Small print under the card. */
  footer?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function AuthShell({ title, description, footer, children, className }: AuthShellProps) {
  return (
    <Surface variant="page" className="grid place-items-center overflow-hidden px-4 py-10">
      <main className="relative z-10 flex w-full max-w-[26rem] flex-col items-center gap-6">
        <InkwellLogo size="md" className="text-foreground" />
        <div
          className={cn(
            "w-full rounded-2xl border border-border bg-card p-7 text-card-foreground shadow-card sm:p-8",
            className,
          )}
        >
          {(title || description) && (
            <div className="mb-6 flex flex-col gap-1">
              {title && (
                <h1 className="font-display text-[30px] leading-tight font-medium tracking-tight text-foreground">
                  {title}
                </h1>
              )}
              {description && <p className="text-sm text-muted-foreground">{description}</p>}
            </div>
          )}

          {children}
        </div>
        {footer && (
          <p className="max-w-[22rem] text-center text-xs text-muted-foreground">{footer}</p>
        )}
      </main>
    </Surface>
  );
}
