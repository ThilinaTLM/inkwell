// EmptyState — the single empty/zero-result surface for the whole
// dashboard (replaces the old hand-drawn "desk note").
//
// Quiet by design: a muted icon disc, a short title, one line of
// explanation, and at most two actions. Used for empty folders, empty
// search results, empty tag views, empty share lists, and the
// first-run state on Home.

import { HugeiconsIcon } from "@hugeicons/react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
  /** Hugeicons icon component. */
  // biome-ignore lint/suspicious/noExplicitAny: icon shape comes from @hugeicons/core-free-icons
  icon?: any;
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  /** Compact variant for use inside panels and dialogs. */
  size?: "default" | "sm";
  className?: string;
}

export function EmptyState({
  icon,
  title,
  description,
  actions,
  size = "default",
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "mx-auto flex max-w-sm flex-col items-center justify-center text-center",
        size === "default" ? "gap-3 px-6 py-14" : "gap-2 px-4 py-8",
        className,
      )}
    >
      {icon ? (
        <div
          className={cn(
            "grid place-items-center rounded-full bg-muted text-muted-foreground",
            size === "default" ? "size-11" : "size-9",
          )}
        >
          <HugeiconsIcon
            icon={icon}
            strokeWidth={1.6}
            className={size === "default" ? "size-5" : "size-4"}
          />
        </div>
      ) : null}
      <div className="space-y-1">
        <h3
          className={cn(
            "font-medium text-foreground",
            size === "default" ? "text-sm" : "text-[0.8125rem]",
          )}
        >
          {title}
        </h3>
        {description ? (
          <p className="text-xs leading-relaxed text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="mt-1 flex flex-wrap justify-center gap-2">{actions}</div> : null}
    </div>
  );
}
