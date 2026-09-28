// "New link" target picker for the Shared links page: type-ahead over
// every folder and file (↑/↓, ↵), then hands off to the ShareDialog.
//
// PUBLIC CONTRACT
//   <NewLinkPicker open onOpenChange />

import { Search01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { folderPathLabel } from "@/features/actions/itemCache";
import { openDialog } from "@/features/dialogs/dialogStore";
import { ItemIcon } from "@/features/library/ItemTable";
import type { FileKind, ItemRef } from "@/lib/api/client";
import { cn } from "@/lib/utils";
import { useShareTargets } from "./useShareTargets";

interface Candidate {
  ref: ItemRef;
  name: string;
  kind?: FileKind;
  location: string;
  updatedAt: number;
}

export function NewLinkPicker({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { allFiles, folders } = useShareTargets();
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      setQ("");
      setActive(0);
    }
  }, [open]);

  const candidates = useMemo<Candidate[]>(() => {
    const all: Candidate[] = [
      ...folders.map((f) => ({
        ref: { type: "folder" as const, id: f.id },
        name: f.name,
        location: folderPathLabel(folders, f.parentId),
        updatedAt: f.updatedAt,
      })),
      ...allFiles.map((f) => ({
        ref: { type: "file" as const, id: f.id },
        name: f.name,
        kind: f.kind,
        location: folderPathLabel(folders, f.folderId),
        updatedAt: f.updatedAt,
      })),
    ];
    const needle = q.trim().toLowerCase();
    const hits = needle
      ? all.filter((c) => `${c.name} ${c.location}`.toLowerCase().includes(needle))
      : all;
    return hits
      .sort((a, b) => {
        if (needle) {
          const as = a.name.toLowerCase().startsWith(needle) ? 0 : 1;
          const bs = b.name.toLowerCase().startsWith(needle) ? 0 : 1;
          if (as !== bs) return as - bs;
        }
        return b.updatedAt - a.updatedAt;
      })
      .slice(0, 60);
  }, [allFiles, folders, q]);

  useEffect(() => {
    listRef.current?.querySelector(`[data-idx="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  function pick(c: Candidate | undefined) {
    if (!c) return;
    onOpenChange(false);
    openDialog("share", { item: c.ref });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-[520px]">
        <DialogTitle className="sr-only">Pick an item to share</DialogTitle>
        <div className="flex h-12 items-center gap-2 border-b border-border px-3.5">
          <HugeiconsIcon
            icon={Search01Icon}
            strokeWidth={2}
            className="size-4 text-muted-foreground"
          />
          <input
            autoFocus
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setActive(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActive((i) => Math.min(candidates.length - 1, i + 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActive((i) => Math.max(0, i - 1));
              } else if (e.key === "Enter") {
                e.preventDefault();
                pick(candidates[active]);
              }
            }}
            placeholder="Share which file or folder?"
            aria-label="Search files and folders"
            className="h-full flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
        </div>
        <div
          ref={listRef}
          role="listbox"
          aria-label="Items"
          className="max-h-[360px] overflow-y-auto p-1.5"
        >
          {candidates.length === 0 ? (
            <p className="px-3 py-8 text-center text-sm text-muted-foreground">No matches.</p>
          ) : (
            candidates.map((c, i) => (
              <div
                key={`${c.ref.type}:${c.ref.id}`}
                role="option"
                tabIndex={-1}
                data-idx={i}
                aria-selected={i === active}
                onMouseMove={() => setActive(i)}
                onClick={() => pick(c)}
                onKeyDown={() => undefined}
                className={cn(
                  "flex h-9 cursor-default items-center gap-2.5 rounded-md px-2.5 text-[13px]",
                  i === active && "bg-accent text-accent-foreground",
                )}
              >
                <ItemIcon kind={c.kind} />
                <span className="min-w-0 truncate font-medium">{c.name}</span>
                <span className="ml-auto truncate pl-3 text-[11.5px] text-muted-foreground">
                  {c.location}
                </span>
              </div>
            ))
          )}
        </div>
        <div className="flex h-8 items-center gap-3 border-t border-border px-3.5 text-[11px] text-muted-foreground">
          <span>↑↓ navigate</span>
          <span>↵ share</span>
          <span>Esc close</span>
        </div>
      </DialogContent>
    </Dialog>
  );
}
