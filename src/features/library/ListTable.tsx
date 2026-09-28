// Dense details-table primitives shared by every non-explorer list
// (library pages, Shared links, Users, Invites). Visual contract follows
// the wireframe `table.lst`: 36px rows, sticky 11.5px header, selected
// rows tinted with the accent, focus shown as a 2px primary inset bar.
//
// PUBLIC CONTRACT
//   <ListTable label selection? onBackgroundClick? className>{<thead/> <tbody/>}</ListTable>
//        – focusable scroll container (role="grid", aria-multiselectable); wires
//          ↑/↓/Home/End(+⇧), Space, ⌘A, Esc and `onActivate` (↵) through `selection`
//   <Th sort? onSort? sortKey? align? className>{label}</Th>   – sortable when `onSort` given
//   <CheckTh selection />                                       – header "select all" checkbox
//   <ListRow rowKey selection? dimmed? onActivate? onContextMenu? className>{cells}</ListRow>
//   <CheckTd rowKey selection />                                – row checkbox cell
//   <Td primary? align? className>{content}</Td>
//   <GroupRow colSpan label count? />                           – "Today · 3" group header row
//   <RowActions>{icon buttons}</RowActions>                     – hover-revealed trailing actions
//   <RowIconButton label icon onClick destructive? disabled? title?/>
//   <PermBadge permission />  <StatusDot tone>{text}</StatusDot>  <EmptyRow colSpan>{…}</EmptyRow>
//   type SortState<K> = { key: K; dir: "asc" | "desc" }

import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import type { KeyboardEvent, MouseEvent, ReactNode } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import type { ListSelectionApi } from "./useListSelection";

export interface SortState<K extends string> {
  key: K;
  dir: "asc" | "desc";
}

export function ListTable({
  label,
  selection,
  onActivate,
  children,
  className,
}: {
  label: string;
  selection?: ListSelectionApi;
  /** ↵ on the focused row (only for tables whose ↵ isn't a global command). */
  onActivate?: (key: string) => void;
  children: ReactNode;
  className?: string;
}) {
  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (!selection) return;
    if (e.target instanceof HTMLElement && e.target.closest("input,button,textarea,select,a")) {
      return;
    }
    if (e.key === "Enter" && onActivate && selection.sel.focus && !e.metaKey && !e.ctrlKey) {
      e.preventDefault();
      onActivate(selection.sel.focus);
      return;
    }
    selection.onKeyDown(e);
  }
  return (
    // biome-ignore lint/a11y/useSemanticElements: grid container wraps a real <table>
    <div
      role="grid"
      aria-label={label}
      aria-multiselectable={selection ? true : undefined}
      tabIndex={0}
      data-hotkeys="allow"
      onKeyDown={onKeyDown}
      onClick={(e) => {
        if (e.target === e.currentTarget) selection?.clear();
      }}
      className={cn(
        "relative min-h-0 flex-1 overflow-auto px-3.5 pb-6 outline-none focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:ring-inset",
        className,
      )}
    >
      <table className="w-full border-collapse text-[12.5px]">{children}</table>
    </div>
  );
}

export function Th<K extends string>({
  children,
  sortKey,
  sort,
  onSort,
  align,
  className,
}: {
  children?: ReactNode;
  sortKey?: K;
  sort?: SortState<K>;
  onSort?: (key: K) => void;
  align?: "right";
  className?: string;
}) {
  const active = !!sortKey && sort?.key === sortKey;
  const base = cn(
    "sticky top-0 z-[1] h-8 border-b border-border bg-background px-2.5 text-left text-[11.5px] font-semibold whitespace-nowrap text-muted-foreground",
    align === "right" && "text-right",
    active && "text-foreground",
    className,
  );
  if (!sortKey || !onSort) return <th className={base}>{children}</th>;
  return (
    <th
      className={base}
      aria-sort={active ? (sort?.dir === "asc" ? "ascending" : "descending") : "none"}
    >
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className="inline-flex items-center gap-1 rounded outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40"
      >
        {children}
        {active ? <span aria-hidden>{sort?.dir === "asc" ? "↑" : "↓"}</span> : null}
      </button>
    </th>
  );
}

function SelectionCheckbox({
  checked,
  indeterminate,
  onChange,
  label,
}: {
  checked: boolean;
  indeterminate?: boolean;
  onChange: () => void;
  label: string;
}) {
  return (
    <Checkbox
      aria-label={label}
      checked={checked}
      indeterminate={indeterminate}
      onCheckedChange={onChange}
      onClick={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
    />
  );
}

export function CheckTh({ selection }: { selection: ListSelectionApi }) {
  const n = selection.sel.selected.length;
  const total = selection.order.length;
  return (
    <th className="sticky top-0 z-[1] h-8 w-7 border-b border-border bg-background pr-0 pl-2.5 text-left">
      <SelectionCheckbox
        label="Select all"
        checked={total > 0 && n === total}
        indeterminate={n > 0 && n < total}
        onChange={() => selection.toggleAll()}
      />
    </th>
  );
}

export function ListRow({
  rowKey,
  selection,
  dimmed,
  onActivate,
  onContextMenu,
  children,
  className,
}: {
  rowKey: string;
  selection?: ListSelectionApi;
  dimmed?: boolean;
  /** Double-click (or single click when `activateOnClick`). */
  onActivate?: () => void;
  onContextMenu?: (e: MouseEvent<HTMLTableRowElement>) => void;
  children: ReactNode;
  className?: string;
}) {
  const selected = selection?.isSelected(rowKey) ?? false;
  const focused = selection?.sel.focus === rowKey;
  return (
    <tr
      data-row-key={rowKey}
      aria-selected={selection ? selected : undefined}
      data-selected={selected || undefined}
      data-focused={focused || undefined}
      onClick={(e) => selection?.onRowClick(rowKey, e)}
      onDoubleClick={onActivate}
      onContextMenu={(e) => {
        selection?.onRowContextMenu(rowKey);
        onContextMenu?.(e);
      }}
      className={cn(
        "group/row cursor-default select-none",
        "hover:[&>td]:bg-muted/60 data-[selected]:[&>td]:bg-accent/70 dark:data-[selected]:[&>td]:bg-accent/50",
        "data-[focused]:[&>td:first-child]:shadow-[inset_2px_0_0_var(--primary)]",
        dimmed && "opacity-55",
        className,
      )}
    >
      {children}
    </tr>
  );
}

export function CheckTd({ rowKey, selection }: { rowKey: string; selection: ListSelectionApi }) {
  return (
    <td className="h-9 w-7 pr-0 pl-2.5">
      <SelectionCheckbox
        label="Select row"
        checked={selection.isSelected(rowKey)}
        onChange={() => selection.toggle(rowKey)}
      />
    </td>
  );
}

export function Td({
  children,
  primary,
  align,
  className,
  title,
}: {
  children?: ReactNode;
  primary?: boolean;
  align?: "right";
  className?: string;
  title?: string;
}) {
  return (
    <td
      title={title}
      className={cn(
        "h-9 max-w-[320px] truncate px-2.5 whitespace-nowrap text-muted-foreground",
        primary && "font-semibold text-foreground",
        align === "right" && "text-right tabular-nums",
        className,
      )}
    >
      {children}
    </td>
  );
}

export function GroupRow({
  colSpan,
  label,
  count,
}: {
  colSpan: number;
  label: string;
  count?: number;
}) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-1 pt-4 pb-1.5">
        <div className="flex items-center gap-2 text-[11px] font-medium tracking-[0.08em] text-muted-foreground uppercase">
          {label}
          {count !== undefined ? <span className="tabular-nums normal-case">{count}</span> : null}
        </div>
      </td>
    </tr>
  );
}

export function EmptyRow({ colSpan, children }: { colSpan: number; children: ReactNode }) {
  return (
    <tr>
      <td colSpan={colSpan} className="py-16 text-center">
        <div className="font-display text-xl italic text-muted-foreground">{children}</div>
      </td>
    </tr>
  );
}

export function RowActions({ children, always }: { children: ReactNode; always?: boolean }) {
  return (
    <div
      className={cn(
        "flex items-center justify-end gap-0.5",
        !always &&
          "opacity-0 group-hover/row:opacity-100 group-data-[selected]/row:opacity-100 focus-within:opacity-100",
      )}
    >
      {children}
    </div>
  );
}

export function RowIconButton({
  label,
  icon,
  onClick,
  destructive,
  disabled,
  title,
}: {
  label: string;
  icon: IconSvgElement;
  onClick: () => void;
  destructive?: boolean;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={title ?? label}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      onDoubleClick={(e) => e.stopPropagation()}
      className={cn(
        "inline-flex size-7 items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40 disabled:pointer-events-none disabled:opacity-40",
        destructive && "hover:text-destructive",
      )}
    >
      <HugeiconsIcon icon={icon} strokeWidth={1.8} className="size-3.5" />
    </button>
  );
}

export function PermBadge({ permission }: { permission: "read" | "write" }) {
  return (
    <span
      className={cn(
        "rounded px-1.5 py-px text-[10.5px] font-medium",
        permission === "write"
          ? "bg-accent text-accent-foreground"
          : "bg-muted text-muted-foreground",
      )}
    >
      {permission === "write" ? "Edit" : "View"}
    </span>
  );
}

export type StatusTone = "ok" | "off" | "pending" | "muted";

export function StatusDot({ tone, children }: { tone: StatusTone; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[11.5px]">
      <span
        aria-hidden
        className={cn(
          "size-[7px] rounded-full",
          tone === "ok" && "bg-chart-5",
          tone === "off" && "bg-destructive",
          tone === "pending" && "bg-chart-3",
          tone === "muted" && "bg-muted-foreground/60",
        )}
      />
      {children}
    </span>
  );
}
