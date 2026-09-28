// AuthShell — centered single-card layout for unauthenticated routes
// (Login, InviteAccept). Screen 22 of the redesign wireframes: the
// sketchy brand card (hand-drawn asymmetric corners, a hair of
// rotation) laid on a quiet paper background.

import type { ReactNode } from "react";
import { InkwellLogo } from "@/components/InkwellLogo";
import { PaperSurface } from "@/components/PaperSurface";
import { cn } from "@/lib/utils";

interface AuthShellProps {
  title?: ReactNode;
  description?: ReactNode;
  /** Small print under the card body (inside the card). */
  footer?: ReactNode;
  children: ReactNode;
  className?: string;
  /** Which way the card leans. Purely decorative. */
  tilt?: "left" | "right";
}

export function AuthShell({
  title,
  description,
  footer,
  children,
  className,
  tilt = "left",
}: AuthShellProps) {
  return (
    <PaperSurface variant="page" className="grid place-items-center overflow-hidden px-4 py-10">
      <main className="relative z-10 w-full max-w-[24rem]">
        <div
          className={cn(
            "relative border-[1.5px] border-card-stroke bg-card p-7 text-card-foreground",
            "rounded-[6px_14px_8px_12px]",
            "shadow-[0_8px_30px_-12px_rgba(28,24,20,0.18)] dark:shadow-[0_18px_40px_-14px_rgba(0,0,0,0.55)]",
            // Decorative lean, desktop only (keeps phones pixel-crisp).
            tilt === "left" ? "sm:-rotate-[0.4deg]" : "sm:rotate-[0.4deg]",
            className,
          )}
        >
          <div className="mb-2 flex items-center text-foreground">
            <InkwellLogo />
          </div>

          {(title || description) && (
            <div className="mb-5 flex flex-col gap-0.5">
              {title && (
                <h1 className="font-hand text-[1.9rem] leading-tight text-foreground">{title}</h1>
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
    </PaperSurface>
  );
}
