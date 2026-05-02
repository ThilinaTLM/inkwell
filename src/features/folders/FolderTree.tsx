// Folder tree for the dashboard sidebar and the move-to picker.
//
// The component is purely presentational: it takes a flat list of
// `FolderMeta` from `folders.list()`, builds a tree once via `useMemo`,
// and renders it with collapse state held locally. The active folder id
// (if any) is highlighted; clicking a row calls `onSelect`.
//
// The optional `onAction` slot lets the dashboard render a per-row
// dropdown menu (rename, share, delete, etc.) without coupling this
// component to any specific menu library.

import { ReactNode, useMemo, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  ArrowDown01Icon,
  ArrowRight01Icon,
  FolderLibraryIcon,
  FolderOpenIcon,
} from "@hugeicons/core-free-icons";

import type { FolderMeta } from "@/lib/api/client";
import { cn } from "@/lib/utils";

interface TreeNode {
  folder: FolderMeta;
  children: TreeNode[];
}

function buildTree(folders: FolderMeta[]): TreeNode[] {
  const byParent = new Map<string | null, FolderMeta[]>();
  for (const f of folders) {
    const arr = byParent.get(f.parentId) || [];
    arr.push(f);
    byParent.set(f.parentId, arr);
  }
  for (const arr of byParent.values()) {
    arr.sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
    );
  }
  const visit = (parentId: string | null): TreeNode[] =>
    (byParent.get(parentId) || []).map((f) => ({
      folder: f,
      children: visit(f.id),
    }));
  return visit(null);
}

export interface FolderTreeProps {
  folders: FolderMeta[];
  /** Currently-selected node. `null` highlights the virtual "Top level"
   *  row when `rootLabel` is provided; otherwise nothing is selected. */
  selectedId: string | null;
  /** `id === null` means the user picked the virtual "Top level" row. */
  onSelect: (id: string | null) => void;
  /** Optional render slot for a per-row action button (e.g. dropdown trigger). */
  renderAction?: (folder: FolderMeta) => ReactNode;
  /** Show the count badge at the right of each row. */
  showCounts?: boolean;
  /** Disable interactions on rows that fail the predicate (used by move-to). */
  disabledFor?: (folder: FolderMeta) => boolean;
  /** When set, prepends a virtual "Top level" row whose id is `null`.
   *  Used by the move-to dialog so users can move a scene/folder to
   *  the literal root. */
  rootLabel?: string;
  className?: string;
}

export function FolderTree({
  folders,
  selectedId,
  onSelect,
  renderAction,
  showCounts = true,
  disabledFor,
  rootLabel,
  className,
}: FolderTreeProps) {
  const tree = useMemo(() => buildTree(folders), [folders]);
  return (
    <ul className={cn("flex flex-col gap-0.5", className)}>
      {rootLabel ? (
        <li>
          <div
            data-active={selectedId === null}
            className={cn(
              "group/folder flex items-center gap-1.5 rounded-md px-1.5 py-1.5 font-sans text-sm text-ink-soft transition-colors hover:bg-manila-soft/60 hover:text-ink",
              "data-[active=true]:bg-manila-soft data-[active=true]:text-ink data-[active=true]:font-medium"
            )}
            style={{ paddingLeft: "4px" }}
          >
            <span className="size-4" aria-hidden />
            <button
              type="button"
              onClick={() => onSelect(null)}
              className="flex min-w-0 flex-1 items-center gap-1.5 outline-none"
            >
              <HugeiconsIcon
                icon={FolderLibraryIcon}
                strokeWidth={1.7}
                className="size-4 shrink-0 opacity-60"
              />
              <span className="truncate">{rootLabel}</span>
            </button>
          </div>
        </li>
      ) : null}
      {tree.map((node) => (
        <FolderNode
          key={node.folder.id}
          node={node}
          depth={0}
          selectedId={selectedId}
          onSelect={onSelect}
          renderAction={renderAction}
          showCounts={showCounts}
          disabledFor={disabledFor}
        />
      ))}
    </ul>
  );
}

interface FolderNodeProps {
  node: TreeNode;
  depth: number;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  renderAction?: (folder: FolderMeta) => ReactNode;
  showCounts: boolean;
  disabledFor?: (folder: FolderMeta) => boolean;
}

function FolderNode({
  node,
  depth,
  selectedId,
  onSelect,
  renderAction,
  showCounts,
  disabledFor,
}: FolderNodeProps) {
  const { folder, children } = node;
  const hasChildren = children.length > 0;
  const [open, setOpen] = useState<boolean>(depth < 1);
  const active = selectedId === folder.id;
  const disabled = disabledFor?.(folder) ?? false;

  return (
    <li>
      <div
        data-active={active}
        data-disabled={disabled}
        className={cn(
          "group/folder flex items-center gap-1.5 rounded-md px-1.5 py-1.5 font-sans text-sm text-ink-soft transition-colors hover:bg-manila-soft/60 hover:text-ink",
          "data-[active=true]:bg-manila-soft data-[active=true]:text-ink data-[active=true]:font-medium",
          "data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-40"
        )}
        style={{ paddingLeft: `${depth * 12 + 4}px` }}
      >
        <button
          type="button"
          aria-label={open ? "Collapse" : "Expand"}
          onClick={() => setOpen((o) => !o)}
          className={cn(
            "grid size-4 place-items-center rounded text-ink-muted hover:bg-ink-soft/15",
            !hasChildren && "invisible"
          )}
        >
          <HugeiconsIcon
            icon={open ? ArrowDown01Icon : ArrowRight01Icon}
            strokeWidth={2}
            className="size-3"
          />
        </button>
        <button
          type="button"
          onClick={() => onSelect(folder.id)}
          className="flex min-w-0 flex-1 items-center gap-1.5 outline-none"
        >
          <HugeiconsIcon
            icon={active ? FolderOpenIcon : FolderLibraryIcon}
            strokeWidth={1.7}
            className="size-4 shrink-0 opacity-80"
          />
          <span className="truncate">{folder.name}</span>
          {showCounts && folder.sceneCount > 0 ? (
            <span className="ml-auto shrink-0 font-hand text-xs text-ink-muted">
              {folder.sceneCount}
            </span>
          ) : null}
        </button>
        {renderAction ? (
          <div className="ml-1 opacity-0 transition-opacity group-hover/folder:opacity-100 data-[active=true]:opacity-100">
            {renderAction(folder)}
          </div>
        ) : null}
      </div>
      {open && hasChildren ? (
        <ul className="flex flex-col gap-0.5">
          {children.map((c) => (
            <FolderNode
              key={c.folder.id}
              node={c}
              depth={depth + 1}
              selectedId={selectedId}
              onSelect={onSelect}
              renderAction={renderAction}
              showCounts={showCounts}
              disabledFor={disabledFor}
            />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

// Helper: returns the path of names from root to the given folder id.
export function folderPath(folders: FolderMeta[], id: string): FolderMeta[] {
  const byId = new Map(folders.map((f) => [f.id, f]));
  const out: FolderMeta[] = [];
  let cur = byId.get(id);
  while (cur) {
    out.unshift(cur);
    cur = cur.parentId ? byId.get(cur.parentId) : undefined;
  }
  return out;
}
