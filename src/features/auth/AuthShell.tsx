// AuthShell — centered single-sheet layout for unauthenticated routes
// (Login, InviteAccept) and the same shape reused for Account.
// A paper page with a slightly rotated paper-elev card laid on top.

import { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { PaperSurface } from "@/components/PaperSurface";

interface AuthShellProps {
  title?: ReactNode;
  description?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function AuthShell({
  title,
  description,
  footer,
  children,
  className,
}: AuthShellProps) {
  return (
    <PaperSurface
      variant="page"
      className="grid place-items-center overflow-hidden px-4 py-10"
    >
      <div className="relative z-10 w-full max-w-md">
        <div className="mb-6 flex flex-col items-center gap-1 text-center">
          <div className="font-heading text-3xl text-ink">inkwell</div>
          <p className="text-sm text-ink-soft">
            A small place for your Excalidraw scenes.
          </p>
        </div>

        <div
          className={cn(
            "relative rounded-lg bg-paper-elev p-7 ring-1 ring-ink-soft/20",
            "shadow-[0_8px_30px_-12px_rgba(28,24,20,0.18)] dark:shadow-[0_18px_40px_-14px_rgba(0,0,0,0.55)]",
            className
          )}
        >
          <div>
            {(title || description) && (
              <div className="mb-4 flex flex-col gap-1">
                {title && (
                  <h2 className="font-heading text-2xl text-ink">{title}</h2>
                )}
                {description && (
                  <p className="text-sm text-ink-soft">
                    {description}
                  </p>
                )}
              </div>
            )}
            {children}
          </div>
        </div>

        {footer && (
          <div className="mt-5 text-center text-sm text-ink-muted">
            {footer}
          </div>
        )}
      </div>
    </PaperSurface>
  );
}
