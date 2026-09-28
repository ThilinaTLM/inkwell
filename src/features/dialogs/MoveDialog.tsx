// Move-to dialog (wireframe screen 13): one component for any mixed
// selection. Type-ahead filter over the folder tree, recent
// destinations, in-place "New folder", ↵ move, ⌥/Alt+↵ duplicate.
// The items' own folders and their descendants are disabled, as is
// the current parent when every item shares it.

import {
  ArrowDown01Icon,
  ArrowRight01Icon,
  Folder01Icon,
  FolderAddIcon,
  Home01Icon,
  Search01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useQueryClient } from "@tanstack/react-query";
import { type KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import { Kbd } from "@/components/shell/Kbd";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { useFolders } from "@/data/folders";
import { descendantFolderIds, folderPathLabel, resolveItems } from "@/features/actions/itemCache";
import { useRecentDestinations } from "@/features/actions/recentDestinations";
import { useItemActions } from "@/features/actions/useItemActions";
import type { FolderMeta, ItemRef } from "@/lib/api/client";
import { fuzzyFilter } from "@/lib/commands/fuzzy";
import { isMacPlatform } from "@/lib/commands/keymap";
import { cn } from "@/lib/utils";

type Row =
  | { kind: "header"; label: string; key: string }
  | {
      kind: "folder";
      key: string;
      id: string | null;
      name: string;
      depth: number;
      hint?: string;
      hasChildren?: boolean;
      expanded?: boolean;
      disabled?: boolean;
      current?: boolean;
    }
  | { kind: "new"; key: string; parentId: string | null; depth: number };

export function MoveDialog({ items, onClose }: { items: ItemRef[]; onClose: () => void }) {
  const qc = useQueryClient();
  const actions = useItemActions();
  const foldersQ = useFolders();
  const all = foldersQ.data ?? [];
  const recent = useRecentDestinations();
  const [open, setOpen] = useState(true);
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState<string | null | undefined>(undefined);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [creating, setCreating] = useState<{ parentId: string | null } | null>(null);
  const [newName, setNewName] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const infos = useMemo(() => resolveItems(qc, items), [qc, items]);
  const parents = new Set(infos.map((i) => i.parentId));
  const currentParent = parents.size === 1 ? [...parents][0] : undefined;
  const disabled = useMemo(
    () =>
      descendantFolderIds(
        all,
        items.filter((r) => r.type === "folder").map((r) => r.id),
      ),
    [all, items],
  );
  const isDisabled = (id: string | null) =>
    (id !== null && disabled.has(id)) || id === currentParent;

  const children = useMemo(() => {
    const m = new Map<string | null, FolderMeta[]>();
    for (const f of all) {
      const arr = m.get(f.parentId) ?? [];
      arr.push(f);
      m.set(f.parentId, arr);
    }
    for (const arr of m.values()) arr.sort((a, b) => a.name.localeCompare(b.name));
    return m;
  }, [all]);

  // Expand the path to the current location on first load.
  const seeded = useRef(false);
  useEffect(() => {
    if (seeded.current || !all.length) return;
    seeded.current = true;
    const next = new Set<string>();
    const byId = new Map(all.map((f) => [f.id, f]));
    let cur = currentParent ? byId.get(currentParent) : undefined;
    while (cur) {
      next.add(cur.id);
      cur = cur.parentId ? byId.get(cur.parentId) : undefined;
    }
    setExpanded(next);
  }, [all, currentParent]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: isDisabled derives from `disabled` + `currentParent`
  const rows: Row[] = useMemo(() => {
    const out: Row[] = [];
    const folderRow = (f: FolderMeta | null, depth: number, hint?: string): Row => {
      const id = f?.id ?? null;
      const kids = children.get(id) ?? [];
      return {
        kind: "folder",
        key: `${hint ? "m" : "t"}:${id ?? "root"}:${depth}`,
        id,
        name: f?.name ?? "Home",
        depth,
        hint,
        hasChildren: kids.length > 0,
        expanded: id === null || (id !== null && expanded.has(id)),
        disabled: isDisabled(id),
        current: id === currentParent,
      };
    };
    if (query.trim()) {
      out.push({ kind: "header", label: "Matches", key: "h-m" });
      const matches = fuzzyFilter(query, all, (f) => f.name, 50);
      if ("home".includes(query.trim().toLowerCase())) out.push(folderRow(null, 0, "Top level"));
      for (const m of matches) {
        const parentPath = folderPathLabel(all, m.item.parentId);
        out.push(folderRow(m.item, 0, `${parentPath} /`));
      }
      if (creating) out.push({ kind: "new", key: "new", parentId: creating.parentId, depth: 0 });
      return out;
    }
    const recentRows = recent
      .filter((id) => id === null || all.some((f) => f.id === id))
      .filter((id) => !isDisabled(id))
      .slice(0, 4);
    if (recentRows.length) {
      out.push({ kind: "header", label: "Recent", key: "h-r" });
      for (const id of recentRows) {
        const f = id ? all.find((x) => x.id === id) : null;
        out.push({
          ...(folderRow(f ?? null, 0, folderPathLabel(all, f?.parentId ?? null)) as Row & {
            kind: "folder";
          }),
          key: `r:${id ?? "root"}`,
          hint: f ? `${folderPathLabel(all, f.parentId)} /` : "Top level",
          hasChildren: false,
        });
      }
    }
    out.push({ kind: "header", label: "All folders", key: "h-a" });
    out.push(folderRow(null, 0));
    const walk = (parentId: string | null, depth: number) => {
      if (creating && creating.parentId === parentId) {
        out.push({ kind: "new", key: "new", parentId, depth });
      }
      for (const f of children.get(parentId) ?? []) {
        out.push(folderRow(f, depth));
        if (expanded.has(f.id)) walk(f.id, depth + 1);
      }
    };
    walk(null, 1);
    return out;
  }, [query, all, children, expanded, recent, creating, disabled, currentParent]);

  const selectable = rows.filter(
    (r): r is Extract<Row, { kind: "folder" }> => r.kind === "folder" && !r.disabled,
  );
  const hlKey =
    highlight === undefined
      ? selectable[0]?.key
      : (selectable.find((r) => r.key === highlight)?.key ?? selectable[0]?.key);
  const hlRow = selectable.find((r) => r.key === hlKey);

  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>(`[data-row="${CSS.escape(hlKey ?? "")}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [hlKey]);

  function close() {
    setOpen(false);
    setTimeout(onClose, 150);
  }

  async function commit(duplicate: boolean) {
    if (!hlRow) return;
    close();
    if (duplicate) await actions.duplicate(items, hlRow.id);
    else await actions.move(items, hlRow.id);
  }

  function toggle(id: string | null, to?: boolean) {
    if (id === null) return;
    setExpanded((prev) => {
      const next = new Set(prev);
      const want = to ?? !next.has(id);
      if (want) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function onKeyDown(e: KeyboardEvent) {
    if ((e.target as HTMLElement).dataset.newFolderInput) return;
    const i = selectable.findIndex((r) => r.key === hlKey);
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const d = e.key === "ArrowDown" ? 1 : -1;
      const next = selectable[Math.max(0, Math.min(selectable.length - 1, i + d))];
      if (next) setHighlight(next.key);
    } else if (e.key === "ArrowRight" && hlRow?.hasChildren && !query) {
      e.preventDefault();
      toggle(hlRow.id, true);
    } else if (
      e.key === "ArrowLeft" &&
      hlRow &&
      !query &&
      (e.target as HTMLInputElement).selectionStart === 0
    ) {
      e.preventDefault();
      toggle(hlRow.id, false);
    } else if (e.key === "Enter") {
      e.preventDefault();
      void commit(e.altKey);
    }
  }

  async function createFolder() {
    if (!creating || !newName.trim()) {
      setCreating(null);
      return;
    }
    const parentId = creating.parentId;
    const f = await actions.createFolder(parentId, newName);
    setCreating(null);
    setNewName("");
    if (f) {
      await qc.invalidateQueries({ queryKey: ["folders"] });
      if (parentId) toggle(parentId, true);
      setQuery("");
      setHighlight(`t:${f.id}:${depthOf(all, parentId) + 1}`);
      inputRef.current?.focus();
    }
  }

  const title = items.length === 1 ? `Move "${infos[0]?.name}"` : `Move ${items.length} items`;
  const from =
    currentParent !== undefined
      ? `from ${currentParent ? (all.find((f) => f.id === currentParent)?.name ?? "folder") : "Home"}`
      : "";

  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent className="gap-0 p-0 sm:max-w-[520px]" onKeyDown={onKeyDown}>
        <div className="flex items-baseline gap-2 border-b border-border px-4 py-3 pr-10">
          <DialogTitle className="truncate text-sm font-semibold">{title}</DialogTitle>
          <DialogDescription className="text-xs">{from}</DialogDescription>
        </div>
        <div className="px-4 py-2.5">
          <div className="flex h-8 items-center gap-2 rounded-md border border-input bg-background px-2">
            <HugeiconsIcon
              icon={Search01Icon}
              strokeWidth={2}
              className="size-3.5 text-muted-foreground"
            />
            <input
              ref={inputRef}
              autoFocus
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setHighlight(undefined);
              }}
              placeholder="Type to filter folders…"
              aria-label="Filter folders"
              className="h-full flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>
        </div>
        <div
          ref={listRef}
          role="listbox"
          aria-label="Destination folder"
          className="max-h-[50vh] min-h-40 overflow-y-auto px-2.5 pb-2.5"
        >
          {foldersQ.isPending ? (
            <div className="px-2 py-6 text-center text-xs text-muted-foreground">
              Loading folders…
            </div>
          ) : null}
          {rows.map((r) => {
            if (r.kind === "header") {
              return (
                <div
                  key={r.key}
                  className="px-2 pt-2.5 pb-1 text-[10.5px] tracking-[0.08em] text-muted-foreground uppercase"
                >
                  {r.label}
                </div>
              );
            }
            if (r.kind === "new") {
              return (
                <div
                  key={r.key}
                  className="flex h-7 items-center gap-2 rounded-md px-2"
                  style={{ paddingLeft: 8 + r.depth * 14 + 14 }}
                >
                  <HugeiconsIcon
                    icon={FolderAddIcon}
                    strokeWidth={1.8}
                    className="size-4 text-muted-foreground"
                  />
                  <input
                    autoFocus
                    data-new-folder-input="1"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        e.stopPropagation();
                        void createFolder();
                      } else if (e.key === "Escape") {
                        e.preventDefault();
                        e.stopPropagation();
                        setCreating(null);
                        inputRef.current?.focus();
                      }
                    }}
                    onBlur={() => void createFolder()}
                    placeholder="New folder name"
                    className="h-6 flex-1 rounded border border-primary bg-background px-1.5 text-sm outline-none"
                  />
                </div>
              );
            }
            const active = r.key === hlKey;
            return (
              <div
                key={r.key}
                data-row={r.key}
                role="option"
                aria-selected={active}
                aria-disabled={r.disabled}
                tabIndex={-1}
                onMouseEnter={() => !r.disabled && setHighlight(r.key)}
                onClick={() => !r.disabled && setHighlight(r.key)}
                onDoubleClick={() => !r.disabled && void commit(false)}
                onKeyDown={() => undefined}
                className={cn(
                  "relative flex h-7 cursor-default items-center gap-1.5 rounded-md pr-2 text-sm text-muted-foreground",
                  active && "bg-accent text-accent-foreground",
                  r.disabled && "opacity-40",
                )}
                style={{ paddingLeft: 4 + r.depth * 14 }}
              >
                <button
                  type="button"
                  tabIndex={-1}
                  aria-label={r.expanded ? "Collapse" : "Expand"}
                  onClick={(e) => {
                    e.stopPropagation();
                    toggle(r.id);
                  }}
                  className={cn(
                    "grid size-4 place-items-center rounded text-muted-foreground/70",
                    (!r.hasChildren || r.id === null || query) && "invisible",
                  )}
                >
                  <HugeiconsIcon
                    icon={r.expanded ? ArrowDown01Icon : ArrowRight01Icon}
                    strokeWidth={2}
                    className="size-3"
                  />
                </button>
                <HugeiconsIcon
                  icon={r.id === null ? Home01Icon : Folder01Icon}
                  strokeWidth={1.7}
                  className="size-4 shrink-0"
                />
                <span className={cn("truncate", active && "font-medium")}>{r.name}</span>
                {r.current ? (
                  <span className="ml-auto text-[11px] text-muted-foreground">current</span>
                ) : r.hint ? (
                  <span className="ml-auto truncate pl-2 text-[11px] text-muted-foreground">
                    {r.hint}
                  </span>
                ) : null}
              </div>
            );
          })}
          {query && selectable.length === 0 ? (
            <div className="px-2 py-6 text-center text-xs text-muted-foreground">
              No folders match “{query}”.
            </div>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2 border-t border-border px-4 py-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setNewName("");
              const parentId = hlRow?.id ?? null;
              if (parentId) toggle(parentId, true);
              setQuery("");
              setCreating({ parentId });
            }}
          >
            <HugeiconsIcon icon={FolderAddIcon} strokeWidth={2} />
            New folder
          </Button>
          <span className="flex-1" />
          <span className="hidden text-[11.5px] text-muted-foreground sm:inline">
            <Kbd>↵</Kbd> move · <Kbd>{isMacPlatform ? "⌥" : "Alt"}</Kbd>
            <Kbd>↵</Kbd> duplicate
          </span>
          <Button variant="outline" size="sm" onClick={close}>
            Cancel
          </Button>
          <Button size="sm" disabled={!hlRow} onClick={() => void commit(false)}>
            Move here
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function depthOf(all: FolderMeta[], id: string | null): number {
  if (id === null) return 0;
  const byId = new Map(all.map((f) => [f.id, f]));
  let d = 1;
  let cur = byId.get(id);
  while (cur?.parentId) {
    d++;
    cur = byId.get(cur.parentId);
  }
  return d;
}
