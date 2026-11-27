// Trash tab: top-level trashed items with relative "Deleted" and "Deletes in N days".
// Trash uses undo elsewhere; here only permanent deletion asks for confirmation (in useItemActions).

import { Delete02Icon, RestoreBinIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { EmptyState } from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useItemActions } from "@/features/actions/useItemActions";
import { trash } from "@/lib/api/client";
import { keys } from "@/lib/api/query-keys";
import { fmtDateTime, relTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { FilesSearch } from "./FilesSearch";
import { TargetIcon } from "./TargetIcon";
import { deletesIn } from "./time";

const DAY = 86_400_000;

export function useTrashList() {
  return useQuery({ queryKey: keys.trash.list(), queryFn: () => trash.list() });
}

export function TrashToolbar({
  q,
  onQ,
  count,
}: {
  q: string;
  onQ: (v: string) => void;
  count: number;
}) {
  const actions = useItemActions();
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <p className="text-[13px] text-muted-foreground">Items are deleted forever after 30 days.</p>
      <div className="ml-auto flex items-center gap-2">
        <FilesSearch value={q} onChange={onQ} placeholder="Filter trash" />
        <Button
          variant="outline"
          size="sm"
          disabled={count === 0}
          onClick={() => void actions.emptyTrash()}
          className="text-destructive hover:text-destructive"
        >
          <HugeiconsIcon icon={Delete02Icon} strokeWidth={1.8} />
          Empty trash
        </Button>
      </div>
    </div>
  );
}

export function TrashTab() {
  const actions = useItemActions();
  const list = useTrashList();
  const [q, setQ] = useState("");
  const now = Date.now();

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (list.data ?? [])
      .filter((t) => !needle || `${t.name} ${t.originalPath}`.toLowerCase().includes(needle))
      .sort((a, b) => b.deletedAt - a.deletedAt);
  }, [list.data, q]);

  return (
    <>
      <TrashToolbar q={q} onQ={setQ} count={list.data?.length ?? 0} />
      {list.isPending ? (
        <div aria-hidden className="overflow-hidden rounded-xl border border-border bg-card">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex h-14 items-center gap-3 border-b border-border px-3">
              <Skeleton className="size-6" />
              <Skeleton className="h-3.5 w-48" />
            </div>
          ))}
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          title={q ? "No matches" : "Trash is empty"}
          body={
            q
              ? "Nothing in Trash matches that filter."
              : "Deleted items wait here for 30 days, so you can change your mind."
          }
          icon={<HugeiconsIcon icon={Delete02Icon} strokeWidth={1.4} className="size-9" />}
        />
      ) : (
        <ul
          aria-label="Trash"
          className="overflow-hidden rounded-xl border border-border bg-card shadow-card"
        >
          {rows.map((t) => {
            const ref = { type: t.type, id: t.id };
            const soon = t.purgeAt - now < DAY;
            return (
              <li
                key={`${t.type}:${t.id}`}
                className="group/row flex min-h-14 flex-wrap items-center gap-x-3 gap-y-1 border-b border-border px-3 py-2 last:border-b-0 hover:bg-accent/50"
              >
                <TargetIcon type={t.type} kind={t.kind} />
                <div className="min-w-0 flex-1 basis-48">
                  <div className="truncate text-[13px] font-medium text-foreground">{t.name}</div>
                  <div className="truncate text-xs text-muted-foreground">
                    {t.originalPath}
                    {t.type === "folder" && t.itemCount
                      ? ` · ${t.itemCount} ${t.itemCount === 1 ? "item" : "items"}`
                      : ""}
                  </div>
                </div>
                <div className="flex flex-col text-right text-xs max-md:hidden">
                  <span className="text-muted-foreground">Deleted {relTime(t.deletedAt, now)}</span>
                  <span
                    className={cn("text-faint", soon && "text-destructive")}
                    title={fmtDateTime(t.purgeAt)}
                  >
                    {deletesIn(t.purgeAt, now)}
                  </span>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <Button variant="outline" size="sm" onClick={() => void actions.restore([ref])}>
                    <HugeiconsIcon icon={RestoreBinIcon} strokeWidth={1.8} />
                    Restore
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:text-destructive"
                    onClick={() => void actions.purge([ref])}
                  >
                    Delete forever
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
