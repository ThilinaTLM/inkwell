// One per-target group section on the SharesPage.
//
// Owns the per-target update/rotate/revoke mutation hooks: each group
// instance knows its `(targetType, targetId)` so it can use the
// well-typed `useUpdateShare` / `useRotateShare` / `useRevokeShare`
// rather than the cross-target `*ByToken` variants. Bulk revoke at the
// page level still uses `useRevokeShareByToken`.

import { FolderIcon, Image01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useNavigate } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { useRevokeShare, useRotateShare, useUpdateShare } from "@/data/shares";
import { ShareLinkRow } from "../ShareLinkRow";
import type { ShareGroup } from "./useSharesFilter";

export function SharesGroup({
  group,
  selected,
  onToggleOne,
  onToggleAll,
}: {
  group: ShareGroup;
  selected: Set<string>;
  onToggleOne: (token: string, on: boolean) => void;
  onToggleAll: (tokens: readonly string[], on: boolean) => void;
}) {
  const navigate = useNavigate();
  const updateShare = useUpdateShare(group.type, group.id);
  const rotateShare = useRotateShare(group.type, group.id);
  const revokeShare = useRevokeShare(group.type, group.id);

  const allSelected = group.rows.every((r) => selected.has(r.token));
  const someSelected = !allSelected && group.rows.some((r) => selected.has(r.token));
  const tokens = group.rows.map((r) => r.token);

  return (
    <section className="rounded-xl bg-card ring-1 ring-border/60 shadow-[0_4px_18px_-12px_rgba(28,24,20,0.18)]">
      <header className="flex flex-wrap items-center gap-2 border-b border-border/60 px-4 py-3">
        <input
          type="checkbox"
          className="hidden size-4 sm:inline-block"
          checked={allSelected}
          ref={(el) => {
            if (el) el.indeterminate = someSelected;
          }}
          onChange={(e) => onToggleAll(tokens, e.target.checked)}
          aria-label={`Select all links for ${group.name}`}
        />
        <HugeiconsIcon
          icon={group.type === "folder" ? FolderIcon : Image01Icon}
          strokeWidth={2}
          className="size-4 text-muted-foreground"
        />
        <button
          type="button"
          onClick={() => navigate(group.type === "file" ? `/f/` : `/folders/${group.id}`)}
          className="min-w-0 flex-1 truncate text-left text-sm font-medium text-foreground hover:underline underline-offset-4"
          title={`Open ${group.type}`}
        >
          {group.name}
        </button>
        <Badge variant="outline" className="shrink-0">
          {group.rows.length} link{group.rows.length === 1 ? "" : "s"}
        </Badge>
      </header>
      <ul className="flex flex-col gap-3 p-4">
        {group.rows.map((sh) => (
          <div key={sh.token} className="flex items-start gap-2">
            <input
              type="checkbox"
              className="mt-5 hidden size-4 shrink-0 sm:inline-block"
              checked={selected.has(sh.token)}
              onChange={(e) => onToggleOne(sh.token, e.target.checked)}
              aria-label={`Select link ${sh.label || sh.token}`}
            />
            <ShareLinkRow
              share={sh}
              className="flex-1"
              onEdit={async (patch) => {
                await updateShare.mutateAsync({ token: sh.token, body: patch });
              }}
              onRotate={async () => {
                const result = await rotateShare.mutateAsync(sh.token);
                return { newToken: result.new.token };
              }}
              onRevoke={async () => {
                await revokeShare.mutateAsync(sh.token);
              }}
            />
          </div>
        ))}
      </ul>
    </section>
  );
}
