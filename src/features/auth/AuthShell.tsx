// AuthShell — centered single-sheet layout for unauthenticated routes
// (Login, InviteAccept).
//
// Deliberately plain: brand mark, product name, one card. Nothing here
// should distract from the single action the page exists for.

import type { ReactNode } from "react";
import { InkwellMark } from "@/components/InkwellMark";
import { cn } from "@/lib/utils";

interface AuthShellProps {
  title?: ReactNode;
  description?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function AuthShell({ title, description, footer, children, className }: AuthShellProps) {
  return (
    <div className="grid min-h-dvh place-items-center bg-background px-4 py-10 text-foreground">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-2 text-center">
          <InkwellMark className="size-8 text-foreground" />
          <div className="text-xl font-semibold tracking-tight text-foreground">Inkwell</div>
          <p className="text-xs text-muted-foreground">
            Your diagrams, notes and sites in one workspace.
          </p>
        </div>

        <div className={cn("rounded-lg border border-border bg-card p-6", className)}>
          {(title || description) && (
            <div className="mb-4 flex flex-col gap-1">
              {title && (
                <h2 className="text-base font-semibold tracking-tight text-foreground">{title}</h2>
              )}
              {description && <p className="text-xs text-muted-foreground">{description}</p>}
            </div>
          )}
          {children}
        </div>

        {footer && <div className="mt-5 text-center text-xs text-muted-foreground">{footer}</div>}
      </div>
    </div>
  );
}
