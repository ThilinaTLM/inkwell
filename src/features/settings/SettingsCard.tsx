// Section card for the one-page Settings: anchor id, Fraunces title,
// optional description + header action, hairline-bordered paper card.

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function SettingsCard({
  id,
  title,
  description,
  action,
  children,
  className,
}: {
  id: string;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      className={cn(
        "scroll-mt-6 rounded-2xl border border-border bg-card p-5 shadow-card sm:p-6",
        className,
      )}
    >
      <div className="mb-4 flex flex-wrap items-start gap-x-4 gap-y-2">
        <div className="min-w-0 flex-1 basis-56">
          <h2
            id={`${id}-title`}
            className="font-display text-[21px] leading-tight font-medium tracking-tight text-foreground"
          >
            {title}
          </h2>
          {description ? (
            <p className="mt-1 text-[13px] text-muted-foreground">{description}</p>
          ) : null}
        </div>
        {action}
      </div>
      <div>{children}</div>
    </section>
  );
}

/** Two-column label/control row used inside a SettingsCard. */
export function Row({
  label,
  help,
  htmlFor,
  children,
}: {
  label: ReactNode;
  help?: ReactNode;
  htmlFor?: string;
  children: ReactNode;
}) {
  return (
    <div className="grid items-center gap-x-6 gap-y-2 border-t border-border py-3 first:border-t-0 first:pt-0 sm:grid-cols-[200px_1fr]">
      <div className="min-w-0">
        {htmlFor ? (
          <label htmlFor={htmlFor} className="text-[13px] font-medium text-foreground">
            {label}
          </label>
        ) : (
          <div className="text-[13px] font-medium text-foreground">{label}</div>
        )}
        {help ? <div className="text-xs text-muted-foreground">{help}</div> : null}
      </div>
      <div className="flex min-w-0 flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}
