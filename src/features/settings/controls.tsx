// Compact form controls in the wireframe language (`.seg`, `.tgl`,
// `.frow`, `.box`) shared by Settings, the Shared-links panel, the
// ShareDialog and the Users pages.
//
// PUBLIC CONTRACT
//   <Segmented value onChange options={[{ value, label, disabled?, title? }]} ariaLabel size? />
//   <Toggle checked onChange label disabled? />            – switch (role="switch")
//   <SettingsGroup title description? action?>{rows}</SettingsGroup>  – `.box` card
//   <SettingRow label help? htmlFor?>{control}</SettingRow>           – two-column row
//   <ChipGroup value onChange options ariaLabel />          – single-select pill chips

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface SegOption<T extends string> {
  value: T;
  label: ReactNode;
  disabled?: boolean;
  title?: string;
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  ariaLabel,
  className,
}: {
  value: T;
  onChange: (next: T) => void;
  options: ReadonlyArray<SegOption<T>>;
  ariaLabel: string;
  className?: string;
}) {
  return (
    <fieldset
      className={cn(
        "inline-flex h-7 shrink-0 overflow-hidden rounded-lg border border-input p-0",
        className,
      )}
    >
      <legend className="sr-only">{ariaLabel}</legend>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={on}
            disabled={o.disabled}
            title={o.title}
            onClick={() => onChange(o.value)}
            className={cn(
              "border-r border-input px-3 text-xs whitespace-nowrap text-muted-foreground outline-none last:border-r-0 hover:bg-muted hover:text-foreground focus-visible:bg-muted focus-visible:text-foreground disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:bg-transparent",
              on && "bg-accent text-accent-foreground hover:bg-accent hover:text-accent-foreground",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </fieldset>
  );
}

export function ChipGroup<T extends string>({
  value,
  onChange,
  options,
  ariaLabel,
  className,
}: {
  value: T | null;
  onChange: (next: T) => void;
  options: ReadonlyArray<SegOption<T>>;
  ariaLabel: string;
  className?: string;
}) {
  return (
    <fieldset className={cn("flex flex-wrap gap-1 border-0 p-0", className)}>
      <legend className="sr-only">{ariaLabel}</legend>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={on}
            disabled={o.disabled}
            title={o.title}
            onClick={() => onChange(o.value)}
            className={cn(
              "inline-flex h-6 items-center rounded-full border border-border px-2.5 text-xs whitespace-nowrap text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40 disabled:opacity-45",
              on && "border-primary/50 bg-accent text-accent-foreground hover:bg-accent",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </fieldset>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  disabled,
  title,
  id,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  disabled?: boolean;
  title?: string;
  id?: string;
}) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      title={title}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-5 w-[34px] shrink-0 items-center rounded-full border transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:opacity-50",
        checked ? "border-primary bg-primary" : "border-input bg-muted",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "absolute top-[2px] size-3.5 rounded-full transition-[left]",
          checked ? "left-[16px] bg-primary-foreground" : "left-[2px] bg-muted-foreground",
        )}
      />
    </button>
  );
}

export function SettingsGroup({
  title,
  description,
  action,
  children,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn("mb-3.5 rounded-xl border border-border bg-card px-[18px] py-4", className)}
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          {description ? (
            <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
          ) : null}
        </div>
        {action}
      </div>
      <div className="mt-3">{children}</div>
    </section>
  );
}

export function SettingRow({
  label,
  help,
  htmlFor,
  children,
  className,
}: {
  label: ReactNode;
  help?: ReactNode;
  htmlFor?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "grid items-center gap-x-4 gap-y-2 border-t border-border py-2.5 first:border-t-0 sm:grid-cols-[220px_1fr]",
        className,
      )}
    >
      <div className="min-w-0">
        {htmlFor ? (
          <label htmlFor={htmlFor} className="text-[12.5px] font-semibold text-foreground">
            {label}
          </label>
        ) : (
          <div className="text-[12.5px] font-semibold text-foreground">{label}</div>
        )}
        {help ? <div className="text-xs text-muted-foreground">{help}</div> : null}
      </div>
      <div className="flex min-w-0 flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}
