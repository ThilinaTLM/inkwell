// FileTree — the sidebar of the Files workspace: bundle overview entry,
// then a collapsible folder tree of every asset. Marks the entry page and
// files with unsaved edits.

import {
  ArrowDown01Icon,
  ArrowRight01Icon,
  Folder01Icon,
  FolderOpenIcon,
  Home01Icon,
  LayoutGridIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useMemo, useState } from "react";
import type { StaticSiteAsset } from "@/lib/api/client";
import { cn } from "@/lib/utils";
import { chipForPath } from "./fileKindChip";
import { buildTree, type TreeNode } from "./sitePaths";

export interface FileTreeProps {
  assets: StaticSiteAsset[];
  entry: string;
  /** Selected file path, or null when the overview is showing. */
  selected: string | null;
  dirty: ReadonlySet<string>;
  onSelect: (path: string) => void;
  onOverview: () => void;
  className?: string;
}

export function FileTree({
  assets,
  entry,
  selected,
  dirty,
  onSelect,
  onOverview,
  className,
}: FileTreeProps) {
  const tree = useMemo(() => buildTree(assets), [assets]);
  const [closed, setClosed] = useState<ReadonlySet<string>>(new Set());
  const toggle = (p: string) =>
    setClosed((s) => {
      const n = new Set(s);
      if (n.has(p)) n.delete(p);
      else n.add(p);
      return n;
    });

  return (
    <nav aria-label="Site files" className={cn("flex min-h-0 flex-col", className)}>
      <div className="p-2 pb-1">
        <button
          type="button"
          onClick={onOverview}
          aria-current={selected === null ? "page" : undefined}
          data-testid="site-overview-link"
          className={cn(rowBase, "gap-2 font-medium", selected === null && rowActive)}
        >
          <HugeiconsIcon icon={LayoutGridIcon} strokeWidth={1.8} className="size-4 shrink-0" />
          Overview &amp; uploads
        </button>
      </div>
      <p className="px-4 pt-2 pb-1 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
        Files
      </p>
      <ul className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        <Nodes
          nodes={tree}
          depth={0}
          entry={entry}
          selected={selected}
          dirty={dirty}
          closed={closed}
          toggle={toggle}
          onSelect={onSelect}
        />
      </ul>
    </nav>
  );
}

const rowBase =
  "flex h-8 w-full items-center rounded-lg px-2 text-left text-[13px] text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50";
const rowActive = "bg-accent-soft text-accent-text hover:bg-accent-soft hover:text-accent-text";

function Nodes({
  nodes,
  depth,
  entry,
  selected,
  dirty,
  closed,
  toggle,
  onSelect,
}: {
  nodes: TreeNode[];
  depth: number;
  entry: string;
  selected: string | null;
  dirty: ReadonlySet<string>;
  closed: ReadonlySet<string>;
  toggle: (p: string) => void;
  onSelect: (p: string) => void;
}) {
  const pad = { paddingLeft: `${8 + depth * 14}px` };
  return (
    <>
      {nodes.map((n) => {
        if (n.type === "dir") {
          const open = !closed.has(n.path);
          return (
            <li key={n.path}>
              <button
                type="button"
                aria-expanded={open}
                onClick={() => toggle(n.path)}
                style={pad}
                className={cn(rowBase, "gap-1.5")}
              >
                <HugeiconsIcon
                  icon={open ? ArrowDown01Icon : ArrowRight01Icon}
                  strokeWidth={2}
                  className="size-3 shrink-0"
                />
                <HugeiconsIcon
                  icon={open ? FolderOpenIcon : Folder01Icon}
                  strokeWidth={1.6}
                  className="size-4 shrink-0"
                />
                <span className="truncate">{n.name}</span>
              </button>
              {open ? (
                <ul>
                  <Nodes
                    nodes={n.children}
                    depth={depth + 1}
                    entry={entry}
                    selected={selected}
                    dirty={dirty}
                    closed={closed}
                    toggle={toggle}
                    onSelect={onSelect}
                  />
                </ul>
              ) : null}
            </li>
          );
        }
        const on = selected === n.path;
        const chip = chipForPath(n.path);
        return (
          <li key={n.path}>
            <button
              type="button"
              aria-current={on ? "true" : undefined}
              onClick={() => onSelect(n.path)}
              style={{ paddingLeft: `${8 + depth * 14 + 16}px` }}
              title={n.path}
              data-testid="site-tree-file"
              className={cn(rowBase, "gap-2", on && rowActive)}
            >
              <span
                aria-hidden
                className="size-2 shrink-0 rounded-full"
                style={{ background: chip.color }}
              />
              <span className={cn("truncate", dirty.has(n.path) && "italic")}>{n.name}</span>
              <span className="ml-auto flex shrink-0 items-center gap-1.5 pl-2">
                {n.path === entry ? (
                  <HugeiconsIcon
                    icon={Home01Icon}
                    strokeWidth={2}
                    className="size-3 opacity-70"
                    aria-label="Entry page"
                  />
                ) : null}
                {dirty.has(n.path) ? (
                  <span
                    role="img"
                    aria-label="Unsaved changes"
                    className="size-1.5 rounded-full bg-primary"
                  />
                ) : null}
              </span>
            </button>
          </li>
        );
      })}
    </>
  );
}
