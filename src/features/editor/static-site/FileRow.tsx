// FileRow — one paper-sheet-style row inside the static-site file
// list. Renders:
//
//   [KindChip]  path                                size   [Entry ribbon | actions]
//
// Visual notes:
//   - The entry row gets a 1px primary stripe down its left edge (a
//     subtle "this is the page that publishes" marker) and a
//     handwritten "entry" washi ribbon on the right.
//   - Non-entry rows reveal a two-icon cluster (set-as-entry + delete)
//     on hover / focus-within, identical in behaviour to the previous
//     implementation. The reservation column is always present so the
//     row layout doesn't shift when actions appear.
//   - `writable={false}` callers (share-token viewers) get an entry
//     ribbon but no action cluster.

import { Delete02Icon, Home02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { cn } from "@/lib/utils";
import { chipForPath } from "./fileKindChip";

export interface FileRowProps {
  path: string;
  size: string;
  isEntry: boolean;
  writable: boolean;
  busy: boolean;
  onSetEntry: () => void;
  onDelete: () => void;
}

export function FileRow({
  path,
  size,
  isEntry,
  writable,
  busy,
  onSetEntry,
  onDelete,
}: FileRowProps) {
  const desc = chipForPath(path);

  return (
    <li
      aria-label={isEntry ? `${path} (entry page)` : path}
      className={cn(
        "group/row relative grid items-center gap-3 px-4 py-2 sm:px-5",
        // Reservation columns: chip | path (flex) | size | actions/ribbon.
        "grid-cols-[auto_minmax(0,1fr)_auto_auto]",
        isEntry && "bg-folder-soft/30",
      )}
    >
      {/* Entry stripe — a thin ink ribbon down the left edge. */}
      {isEntry ? (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-y-1 left-0 w-[3px] rounded-full bg-primary/70"
        />
      ) : null}

      <KindChip abbr={desc.abbr} label={desc.label} color={desc.color} fg={desc.fg} />

      <span
        className={cn(
          "min-w-0 truncate font-mono text-xs",
          isEntry ? "font-semibold text-foreground" : "text-foreground/85",
        )}
        title={path}
      >
        {path}
      </span>

      <span className="font-mono text-[10px] tabular-nums text-muted-foreground">{size}</span>

      <div className="flex min-w-[5.25rem] items-center justify-end">
        {isEntry ? (
          <EntryRibbon />
        ) : writable ? (
          <RowActions onSetEntry={onSetEntry} onDelete={onDelete} disabled={busy} path={path} />
        ) : (
          <span aria-hidden className="block w-0" />
        )}
      </div>
    </li>
  );
}

// ─── KindChip ────────────────────────────────────────────────────────

function KindChip({
  abbr,
  label,
  color,
  fg,
}: {
  abbr: string;
  label: string;
  color: string;
  fg: string;
}) {
  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      className="inline-grid size-[1.125rem] place-items-center rounded-[4px] font-heading text-[8px] font-bold uppercase tracking-tight ring-1 ring-border/40"
      style={{ backgroundColor: color, color: fg }}
    >
      {abbr}
    </span>
  );
}

// ─── EntryRibbon ─────────────────────────────────────────────────────
//
// A handwritten "entry" washi-tape ribbon, sized to fit inside the
// row. Inline emulation of `<TapeChip>`'s look without the rough.js
// roundtrip (which would be wasteful on every list row); the chip
// itself is a pill with the primary-accent fill and the Caveat hand.

function EntryRibbon() {
  return (
    <span
      aria-hidden
      className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 font-hand text-sm leading-none text-primary ring-1 ring-primary/30"
      style={{ transform: "rotate(-1.2deg)" }}
    >
      entry
    </span>
  );
}

// ─── RowActions ──────────────────────────────────────────────────────

function RowActions({
  path,
  onSetEntry,
  onDelete,
  disabled,
}: {
  path: string;
  onSetEntry: () => void;
  onDelete: () => void;
  disabled: boolean;
}) {
  return (
    <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover/row:opacity-100 focus-within:opacity-100">
      <button
        type="button"
        className="rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 disabled:opacity-50"
        title="Set as entry"
        aria-label={`Set ${path} as entry`}
        onClick={onSetEntry}
        disabled={disabled}
      >
        <HugeiconsIcon icon={Home02Icon} className="size-3.5" />
      </button>
      <button
        type="button"
        className="rounded p-1 text-destructive transition-colors hover:bg-destructive/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 disabled:opacity-50"
        title="Delete"
        aria-label={`Delete ${path}`}
        onClick={() => {
          if (window.confirm(`Delete "${path}"? This cannot be undone.`)) {
            onDelete();
          }
        }}
        disabled={disabled}
      >
        <HugeiconsIcon icon={Delete02Icon} className="size-3.5" />
      </button>
    </div>
  );
}
