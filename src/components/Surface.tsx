// Surface — the flat base background for a page or region.
//
// A plain theme-aware fill (via tokens) and nothing else: no texture,
// no decoration. Use `variant="page"` at the top of a route,
// `variant="card"` for elevated surfaces, and `variant="banner"` for
// top bars.

import type * as React from "react";
import { cn } from "@/lib/utils";

export type SurfaceVariant = "page" | "card" | "banner";

interface SurfaceProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: SurfaceVariant;
}

export function Surface({ variant = "page", className, children, ...rest }: SurfaceProps) {
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
      {children}
    </div>
  );
}
