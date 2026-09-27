// Shared page chrome for every page inside the AppShell, so all pages
// line up with the explorer (wireframe `explorerToolbar()`, `filterBar()`,
// `statusBar()`).
//
// PUBLIC CONTRACT
//   <PageToolbar icon?={IconSvgElement} title?={ReactNode} right?={ReactNode} className?>
//      {children}                     – 48px row: [icon title] children … right
//   </PageToolbar>
//   <FilterBar className?>{children}</FilterBar>        – 40px row under the toolbar
//   <FilterChip active? onClick? icon?>{children}</FilterChip>
//   <ToolbarSearch value onChange placeholder? className? />
//                                      – filter input with a `/` hint; the global `/`
//                                        shortcut focuses it (data-toolbar-search); Esc
//                                        clears then blurs
//   <PageBody className? padded?={true}>{children}</PageBody>  – flex-1 scroll container
//   <StatusBar left right?={ReactNode} />   – 30px row; default right = "? shortcuts · ⌘K commands"
//   <PageTitle>{children}</PageTitle>        – hand-font page title (Excalifont/Caveat)
//   <PageFrame>{toolbar/body/status}</PageFrame>  – flex column filling the shell's main area

import { FilterIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import { type ReactNode, useRef } from "react";
import { cn } from "@/lib/utils";
import { CommandKeys, Kbd } from "./Kbd";

export function PageFrame({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("flex min-h-0 min-w-0 flex-1 flex-col", className)}>{children}</div>;
}

export function PageTitle({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <h1
      className={cn(
        "truncate font-brand text-[22px] leading-none font-normal text-foreground",
        className,
      )}
    >
      {children}
    </h1>
  );
}

export function PageToolbar({
  icon,
  title,
  right,
  children,
  className,
}: {
  icon?: IconSvgElement;
  title?: ReactNode;
  right?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex h-12 shrink-0 items-center gap-1.5 border-b border-border px-3",
        className,
      )}
    >
      {icon || title ? (
        <div className="flex min-w-0 items-center gap-2 pr-2">
          {icon ? (
            <HugeiconsIcon
              icon={icon}
              strokeWidth={1.8}
              className="size-[18px] text-muted-foreground"
            />
          ) : null}
          {typeof title === "string" ? <PageTitle>{title}</PageTitle> : title}
        </div>
      ) : null}
      {children}
      <div className="flex-1" />
      {right ? <div className="flex shrink-0 items-center gap-1.5">{right}</div> : null}
    </div>
  );
}

export function FilterBar({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "flex h-10 shrink-0 items-center gap-1.5 overflow-x-auto border-b border-border px-3 text-xs text-muted-foreground",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function FilterChip({
  active,
  onClick,
  icon,
  children,
  className,
  title,
}: {
  active?: boolean;
  onClick?: () => void;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
  title?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={!!active}
      onClick={onClick}
      title={title}
      className={cn(
        "inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full border px-2.5 text-xs whitespace-nowrap transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
        active
          ? "border-primary/50 bg-accent text-accent-foreground"
          : "border-border text-muted-foreground hover:bg-muted hover:text-foreground",
        className,
      )}
    >
      {icon}
      {children}
    </button>
  );
}

export function ToolbarSearch({
  value,
  onChange,
  placeholder = "Filter",
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <label
      className={cn(
        "flex h-7 w-[200px] items-center gap-1.5 rounded-md border border-border bg-card px-2 text-muted-foreground focus-within:border-ring/60 focus-within:ring-2 focus-within:ring-ring/20",
        className,
      )}
    >
      <HugeiconsIcon icon={FilterIcon} strokeWidth={2} className="size-3.5 shrink-0" />
      <input
        ref={ref}
        data-toolbar-search=""
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.stopPropagation();
            if (value) onChange("");
            else ref.current?.blur();
          }
        }}
        placeholder={placeholder}
        aria-label={placeholder}
        className="h-full min-w-0 flex-1 bg-transparent text-xs text-foreground outline-none placeholder:text-muted-foreground"
      />
      {value ? null : <Kbd>/</Kbd>}
    </label>
  );
}

export function PageBody({
  children,
  className,
  padded = true,
}: {
  children: ReactNode;
  className?: string;
  padded?: boolean;
}) {
  return (
    <div
      className={cn("relative min-h-0 flex-1 overflow-auto", padded && "px-4 py-3.5", className)}
    >
      {children}
    </div>
  );
}

export function StatusBar({
  left,
  right,
  className,
}: {
  left?: ReactNode;
  right?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "hidden h-[30px] shrink-0 items-center gap-3.5 border-t border-border px-3.5 text-[11.5px] text-muted-foreground md:flex",
        className,
      )}
    >
      <div className="flex min-w-0 items-center gap-3.5 truncate">{left}</div>
      <div className="flex-1" />
      {right ?? (
        <span className="flex items-center gap-1">
          <CommandKeys id="app.shortcuts" /> shortcuts · <CommandKeys id="app.palette" /> commands
        </span>
      )}
    </div>
  );
}
