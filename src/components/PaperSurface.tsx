// PaperSurface — wraps a region with the sketchbook paper background.
//
// Two visual layers:
//   1. a flat color (paper cream / chalkboard slate, theme-aware via tokens)
//   2. a subtle SVG-noise grain overlay that gives the surface its "tooth"
//
// The grain is applied via the `.bg-paper-grain` utility from index.css —
// kept there so it can be reused on any element without bundling an image.

import type * as React from "react";
import { cn } from "@/lib/utils";

export type PaperSurfaceVariant = "page" | "card" | "banner";

interface PaperSurfaceProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: PaperSurfaceVariant;
  /** Disable the noise overlay (useful for nested surfaces where grain stacks badly). */
  noGrain?: boolean;
}

/**
 * The base of every page in Inkwell. Use `variant="page"` at the top of a
 * route, `variant="card"` for elevated surfaces (paper sheets layered on the
 * desk), and `variant="banner"` for ribbon-like top bars.
 */
export function PaperSurface({
  variant = "page",
  noGrain,
  className,
  children,
  ...rest
}: PaperSurfaceProps) {
  return (
    <div
      className={cn(
        "relative isolate",
        variant === "page" && "min-h-dvh bg-background text-foreground",
        variant === "card" && "bg-card text-card-foreground",
        variant === "banner" && "bg-background text-foreground",
        className,
      )}
      {...rest}
    >
      {!noGrain && (
        <div aria-hidden className="bg-paper-grain pointer-events-none absolute inset-0 -z-10" />
      )}
      {children}
    </div>
  );
}
