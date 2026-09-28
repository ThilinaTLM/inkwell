// EmptyState — centered zero-state used when a folder is empty, a link
// is invalid, a search returns nothing, etc. An optional muted icon, a
// display-serif italic headline, a quiet supporting line and an action.

import type * as React from "react";
import { cn } from "@/lib/utils";

export interface EmptyStateProps {
  title: string;
  body?: React.ReactNode;
  action?: React.ReactNode;
  icon?: React.ReactNode;
  className?: string;
}

export function EmptyState({ title, body, action, icon, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        "mx-auto mt-8 flex max-w-md flex-col items-center px-6 py-10 text-center",
        className,
      )}
    >
      {icon ? <div className="mb-4 text-muted-foreground/70">{icon}</div> : null}
      <h3 className="font-display text-2xl font-normal italic leading-tight text-foreground">
        {title}
      </h3>
      {body ? <div className="mt-2 text-sm/relaxed text-muted-foreground">{body}</div> : null}
      {action ? <div className="mt-5 flex justify-center">{action}</div> : null}
    </div>
  );
}
