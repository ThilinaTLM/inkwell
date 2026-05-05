// SharesPage — centralized "manage every link I've shared" view.
//
// Surfaces the existing `GET /api/shares` endpoint that, until now, no
// page consumed. Lists every active share owned by the caller, grouped
// by target (one section per file/folder), with the same row UI used
// in the per-target ShareDialog so edit / rotate / revoke / copy
// behaviour is identical.
//
// Filters and search are client-side; the data set is small (one
// account's shares) and the API doesn't need to grow query params for
// this. Bulk revoke is desktop-only in v1 (hidden below `sm`).
//
// The page itself is now a thin composition: filter strip + grouped
// list + bulk-revoke confirm. Grouping/filter state lives in
// `useSharesFilter`; per-group rendering lives in `SharesGroup`.

import { Link04Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { AppPage, AppPageHeader } from "@/components/AppPage";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { ElevatedCard } from "@/components/ElevatedCard";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useMe } from "@/data/auth";
import { useAllShares, useRevokeShareByToken } from "@/data/shares";
import { errorMessage } from "@/lib/errors";
import { SharesFilters } from "./SharesPage/SharesFilters";
import { SharesGroup } from "./SharesPage/SharesGroup";
import { useSharesFilter, useSharesSelection } from "./SharesPage/useSharesFilter";

export function SharesPage() {
  const me = useMe();
  const sharesQuery = useAllShares();
  // Bulk revoke is the only mutation owned by the page itself: it
  // operates on tokens spanning multiple targets, so it has to use the
  // cross-target path. Per-row update/rotate/revoke happen inside each
  // SharesGroup with the correctly-scoped per-target hooks.
  const revokeShare = useRevokeShareByToken();

  const shares = sharesQuery.data ?? null;
  const filter = useSharesFilter(shares);
  const { selected, toggleOne, toggleMany, clear } = useSharesSelection();
  const [bulkConfirm, setBulkConfirm] = useState(false);

  const totalCount = shares?.length ?? 0;
  const filteredCount = filter.filtered?.length ?? 0;
  const selectedCount = selected.size;

  async function handleBulkRevoke() {
    const tokens = [...selected];
    const results = await Promise.allSettled(tokens.map((tk) => revokeShare.mutateAsync(tk)));
    const failed = results.filter((r) => r.status === "rejected").length;
    clear();
    if (failed === 0)
      toast.success(`Revoked ${tokens.length} link${tokens.length === 1 ? "" : "s"}.`);
    else toast.error(`Revoked ${tokens.length - failed} of ${tokens.length}; ${failed} failed.`);
  }

  if (!me.data) return null;

  return (
    <AppPage user={me.data}>
      <AppPageHeader
        icon={Link04Icon}
        title="Shared links"
        description={
          totalCount === 0
            ? "Nothing shared yet."
            : `Manage every active link you've created (${totalCount} total).`
        }
        backTo="/"
        backLabel="Back to dashboard"
        actions={
          selectedCount > 0 ? (
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">{selectedCount} selected</span>
              <Button size="sm" variant="destructive" onClick={() => setBulkConfirm(true)}>
                Revoke selected
              </Button>
            </div>
          ) : null
        }
      />

      <SharesFilters
        search={filter.search}
        onSearchChange={filter.setSearch}
        typeFilter={filter.typeFilter}
        onTypeFilterChange={filter.setTypeFilter}
        permFilter={filter.permFilter}
        onPermFilterChange={filter.setPermFilter}
      />

      {sharesQuery.isPending ? (
        <SharesSkeleton />
      ) : sharesQuery.isError ? (
        <ElevatedCard className="px-6 py-10 text-center">
          <p className="text-sm text-destructive">
            {errorMessage(sharesQuery.error, "Could not load shares.")}
          </p>
        </ElevatedCard>
      ) : !filter.groups || filter.groups.length === 0 ? (
        <ElevatedCard className="px-6 py-12 text-center">
          <HugeiconsIcon
            icon={Link04Icon}
            strokeWidth={1.5}
            className="mx-auto mb-3 size-9 text-muted-foreground/50"
          />
          <p className="text-base font-medium text-foreground">
            {totalCount === 0 ? "Nothing shared yet" : "No links match these filters"}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {totalCount === 0
              ? "Open a file or folder and click Share to create your first link."
              : `Adjust the filters above${
                  filteredCount !== totalCount ? "" : ""
                } or clear the search.`}
          </p>
          {totalCount === 0 ? (
            <Button size="sm" variant="outline" className="mt-4" render={<Link to="/" />}>
              Browse files
            </Button>
          ) : null}
        </ElevatedCard>
      ) : (
        <div className="flex flex-col gap-4">
          {filter.groups.map((g) => (
            <SharesGroup
              key={`${g.type}:${g.id}`}
              group={g}
              selected={selected}
              onToggleOne={toggleOne}
              onToggleAll={toggleMany}
            />
          ))}
        </div>
      )}

      <ConfirmDialog
        open={bulkConfirm}
        onOpenChange={setBulkConfirm}
        title={`Revoke ${selectedCount} link${selectedCount === 1 ? "" : "s"}?`}
        description="The selected URLs will stop working immediately. This cannot be undone."
        confirmLabel={`Revoke ${selectedCount}`}
        busyLabel="Revoking…"
        onConfirm={handleBulkRevoke}
      />
    </AppPage>
  );
}

function SharesSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      {[0, 1].map((i) => (
        <div key={i} className="rounded-xl bg-card p-4 ring-1 ring-border/60">
          <Skeleton className="mb-3 h-6 w-1/3" />
          <Skeleton className="mb-2 h-24 w-full rounded-xl" />
          <Skeleton className="h-24 w-full rounded-xl" />
        </div>
      ))}
    </div>
  );
}
