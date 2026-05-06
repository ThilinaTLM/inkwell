// EmptyDeskNote — a paper-note zero-state used when a folder is empty,
// when a search returns nothing, or as a placeholder for any other empty
// surface. The card silhouette is a slightly torn RoughBox; type is plain
// Inter (was Excalifont/Caveat before the font system was simplified).

import type * as React from "react";
import { RoughBox } from "@/components/rough/RoughBox";
import { cn } from "@/lib/utils";

export interface EmptyDeskNoteProps {
  title: string;
  body?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
  seed?: string;
}

export function EmptyDeskNote({
  title,
  body,
  action,
  className,
  seed = "empty-note",
}: EmptyDeskNoteProps) {
  return (
    <div
      className={cn("relative mx-auto mt-8 max-w-md", className)}
      style={{ transform: "rotate(-0.6deg)" }}
    >
      <div className="relative px-8 py-10 text-center">
        <RoughBox
          shape="card"
          seed={seed}
          stroke="var(--color-card-stroke)"
          strokeWidth={1.4}
          fill="var(--color-card)"
          fillStyle="solid"
          roughness={1.4}
          bowing={2}
          radius={6}
        />
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10 rounded-md shadow-[0_12px_30px_-14px_rgba(28,24,20,0.35)]"
        />
        {/* Wrap content in a `relative` block so it paints above the
            absolute-positioned RoughBox card silhouette. */}
        <div className="relative">
          <h3 className="font-heading text-xl font-semibold tracking-tight text-foreground">
            {title}
          </h3>
          {body && <div className="mt-2 text-sm/relaxed text-muted-foreground">{body}</div>}
          {action && <div className="mt-5 flex justify-center">{action}</div>}
        </div>
      </div>
    </div>
  );
}
