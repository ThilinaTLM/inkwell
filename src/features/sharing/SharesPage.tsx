// Shared tab of the Files hub: share links grouped by item.
// Row actions: Copy link · Edit · Revoke. One filter field, no popovers.
//
// `SharedTab` is the body (rendered inside FilesPage); `SharesPage` is kept as a
// thin alias for older imports.

import { Copy01Icon, Delete02Icon, Edit02Icon, Link04Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { EmptyState } from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useAllShares } from "@/data/shares";
import { useItemActions } from "@/features/actions/useItemActions";
import { FilesSearch } from "@/features/library/FilesSearch";
import { TargetIcon } from "@/features/library/TargetIcon";
import { expiresIn } from "@/features/library/time";
import type { Share } from "@/lib/api/client";
import { cn } from "@/lib/utils";
import { copyShareLink } from "./ShareDialog";
import { ShareEditDialog } from "./ShareEditDialog";
import { revokeShares } from "./shareActions";
import { shareStatus } from "./shareStatus";
import { type ShareTarget, useShareTargets } from "./useShareTargets";

interface Group {
  key: string;
  target: ShareTarget;
  shares: Share[];
}

function IconAction({
  label,
  onClick,
  danger,
  icon,
}: {
  label: string;
  onClick: () => void;
  danger?: boolean;
  icon: typeof Copy01Icon;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={label}
            onClick={onClick}
            className={cn(danger && "text-destructive hover:text-destructive")}
          />
        }
      >
        <HugeiconsIcon icon={icon} strokeWidth={1.8} />
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

function AccessPill({ permission }: { permission: Share["permission"] }) {
  return (
    <span
      className={cn(
        "inline-flex h-5 items-center rounded-full px-2 text-[11px] font-medium",
        permission === "write"
          ? "bg-accent-soft text-accent-text"
          : "bg-surface-2 text-muted-foreground",
      )}
    >
      {permission === "write" ? "Edit" : "View"}
    </span>
  );
}

export function SharedTab() {
  const qc = useQueryClient();
  const actions = useItemActions();
  const sharesQ = useAllShares();
  const { resolve } = useShareTargets();
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<Share | null>(null);
  const now = Date.now();

  const groups = useMemo<Group[]>(() => {
    const needle = q.trim().toLowerCase();
    const map = new Map<string, Group>();
    for (const s of sharesQ.data ?? []) {
      const target = resolve(s);
      if (needle && !`${target.name} ${s.label ?? ""}`.toLowerCase().includes(needle)) continue;
      const key = `${s.targetType}:${s.targetId}`;
      const g = map.get(key) ?? { key, target, shares: [] };
      g.shares.push(s);
      map.set(key, g);
    }
    const list = [...map.values()];
    for (const g of list) g.shares.sort((a, b) => b.createdAt - a.createdAt);
    return list.sort(
      (a, b) =>
        Math.max(...b.shares.map((s) => s.createdAt)) -
        Math.max(...a.shares.map((s) => s.createdAt)),
    );
  }, [sharesQ.data, q, resolve]);

  const total = sharesQ.data?.length ?? 0;
  const editingTarget = editing ? resolve(editing) : null;

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <p className="text-[13px] text-muted-foreground">
          {sharesQ.data
            ? `${total} ${total === 1 ? "link" : "links"}. Share an item from its menu or press Shift+S.`
            : " "}
        </p>
        <div className="ml-auto">
          <FilesSearch value={q} onChange={setQ} placeholder="Filter shared" />
        </div>
      </div>

      {sharesQ.isPending ? (
        <div aria-hidden className="overflow-hidden rounded-xl border border-border bg-card">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex h-14 items-center gap-3 border-b border-border px-3">
              <Skeleton className="size-6" />
              <Skeleton className="h-3.5 w-48" />
            </div>
          ))}
        </div>
      ) : groups.length === 0 ? (
        <EmptyState
          title={q ? "No matches" : "No shared links"}
          body={
            q
              ? "No shared item matches that filter."
              : "Share a file or project and its links will be listed here."
          }
          icon={<HugeiconsIcon icon={Link04Icon} strokeWidth={1.4} className="size-9" />}
        />
      ) : (
        <div className="flex flex-col gap-4">
          {groups.map((g) => (
            <section
              key={g.key}
              aria-label={g.target.name}
              className="overflow-hidden rounded-xl border border-border bg-card shadow-card"
            >
              <header className="flex items-center gap-3 border-b border-border bg-surface-2 px-3 py-2">
                <TargetIcon type={g.target.ref.type} kind={g.target.kind} />
                <button
                  type="button"
                  disabled={!g.target.exists}
                  onClick={() => actions.open(g.target.ref)}
                  className="min-w-0 truncate text-left text-[13px] font-medium text-foreground outline-none hover:underline focus-visible:underline disabled:no-underline"
                >
                  {g.target.name}
                </button>
                <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                  {g.target.exists ? g.target.location : "Item no longer exists"}
                </span>
              </header>
              <ul>
                {g.shares.map((s) => {
                  const status = shareStatus(s, now);
                  return (
                    <li
                      key={s.token}
                      className={cn(
                        "flex min-h-11 flex-wrap items-center gap-x-3 gap-y-1 border-b border-border px-3 py-1.5 text-[13px] last:border-b-0 hover:bg-accent/50",
                        status === "expired" && "opacity-60",
                      )}
                    >
                      <span className="min-w-0 flex-1 basis-40 truncate">
                        {s.label || <span className="text-muted-foreground">Untitled link</span>}
                      </span>
                      <AccessPill permission={s.permission} />
                      <span
                        className={cn(
                          "w-36 text-xs text-muted-foreground max-sm:w-auto",
                          status === "expiring" && "text-warning",
                          status === "expired" && "text-destructive",
                        )}
                        title={s.expiresAt ? new Date(s.expiresAt).toLocaleString() : undefined}
                      >
                        {expiresIn(s.expiresAt, now)}
                      </span>
                      <div className="flex items-center">
                        <IconAction
                          label="Copy link"
                          icon={Copy01Icon}
                          onClick={() => void copyShareLink(s.token)}
                        />
                        <IconAction label="Edit" icon={Edit02Icon} onClick={() => setEditing(s)} />
                        <IconAction
                          label="Revoke"
                          icon={Delete02Icon}
                          danger
                          onClick={() => void revokeShares(qc, [s])}
                        />
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}

      {editing && editingTarget ? (
        <ShareEditDialog
          share={editing}
          targetName={editingTarget.name}
          targetKind={editingTarget.kind}
          open
          onOpenChange={(o) => {
            if (!o) setEditing(null);
          }}
        />
      ) : null}
    </>
  );
}

export const SharesPage = SharedTab;
