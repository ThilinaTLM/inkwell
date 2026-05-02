// AuthShell — centered single-sheet layout for unauthenticated routes
// (Login, InviteAccept) and the same shape reused for Account.
// A paper page with a slightly rotated paper-elev card laid on top.

import { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { PaperSurface } from "@/components/PaperSurface";
import { RoughBox } from "@/components/rough";

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
          <p className="font-hand text-base text-ink-soft">
            A small place for your Excalidraw scenes.
          </p>
        </div>

        <div
          className={cn("relative isolate p-7", className)}
          style={{ transform: "rotate(-0.4deg)" }}
        >
          <RoughBox
            shape="card"
            seed="auth-shell"
            stroke="var(--color-ink-soft)"
            strokeWidth={1.4}
            fill="var(--color-paper-elev)"
            fillStyle="solid"
            roughness={1.2}
            radius={6}
          />
          <span
            aria-hidden
            className="pointer-events-none absolute inset-0 -z-10 rounded-md shadow-[0_18px_40px_-14px_rgba(28,24,20,0.35)]"
          />

          <div className="relative">
            {(title || description) && (
              <div className="mb-4 flex flex-col gap-1">
                {title && (
                  <h2 className="font-heading text-2xl text-ink">{title}</h2>
                )}
                {description && (
                  <p className="font-hand text-base text-ink-soft">
                    {description}
                  </p>
                )}
              </div>
            )}
            {children}
          </div>
        </div>

        {footer && (
          <div className="mt-5 text-center font-hand text-sm text-ink-muted">
            {footer}
          </div>
        )}
      </div>
    </PaperSurface>
  );
}
