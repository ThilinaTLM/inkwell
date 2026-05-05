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

import { FolderIcon, Image01Icon, Link04Icon, Search01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { AppPage, AppPageHeader } from "@/components/AppPage";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { ElevatedCard } from "@/components/ElevatedCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useMe } from "@/features/auth/hooks";
import {
  useAllShares,
  useRevokeShareGeneric,
  useRotateShareGeneric,
  useUpdateShareGeneric,
} from "@/features/sharing/hooks";
import type { Share, ShareTargetType } from "@/lib/api/client";
import { errorMessage } from "@/lib/errors";
import { cn } from "@/lib/utils";
import { ShareLinkRow } from "./ShareLinkRow";

type TargetTypeFilter = "all" | "file" | "folder";
type PermissionFilter = "all" | "read" | "write";

export default function SharesPage() {
  const me = useMe();
  const navigate = useNavigate();
  const sharesQuery = useAllShares();
  const updateShare = useUpdateShareGeneric();
  const rotateShare = useRotateShareGeneric();
  const revokeShare = useRevokeShareGeneric();

  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<TargetTypeFilter>("all");
  const [permFilter, setPermFilter] = useState<PermissionFilter>("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkConfirm, setBulkConfirm] = useState(false);

  const shares = sharesQuery.data ?? null;

  const filtered = useMemo(() => {
    if (!shares) return null;
    const needle = search.trim().toLowerCase();
    return shares.filter((s) => {
      if (typeFilter !== "all" && s.targetType !== typeFilter) return false;
      if (permFilter !== "all" && s.permission !== permFilter) return false;
      if (!needle) return true;
      const hay = `${s.label ?? ""} ${s.targetName ?? ""} ${s.token}`.toLowerCase();
      return hay.includes(needle);
    });
  }, [shares, search, typeFilter, permFilter]);

  // Group filtered rows by target. Map preserves insertion order, which
  // mirrors the API's "newest share first" sort.
  const groups = useMemo(() => {
    if (!filtered) return null;
    const map = new Map<
      string,
      { type: ShareTargetType; id: string; name: string; rows: Share[] }
    >();
    for (const s of filtered) {
      const key = `${s.targetType}:${s.targetId}`;
      const existing = map.get(key);
      if (existing) {
        existing.rows.push(s);
      } else {
        map.set(key, {
          type: s.targetType,
          id: s.targetId,
          name: s.targetName ?? "(untitled)",
          rows: [s],
        });
      }
    }
    return [...map.values()];
  }, [filtered]);

  const selectedCount = selected.size;

  function toggleSelected(token: string, on: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(token);
      else next.delete(token);
      return next;
    });
  }

  function toggleGroup(rows: Share[], on: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const r of rows) {
        if (on) next.add(r.token);
        else next.delete(r.token);
      }
      return next;
    });
  }

  async function handleBulkRevoke() {
    const tokens = [...selected];
    const results = await Promise.allSettled(tokens.map((tk) => revokeShare.mutateAsync(tk)));
    const failed = results.filter((r) => r.status === "rejected").length;
    setSelected(new Set());
    if (failed === 0)
      toast.success(`Revoked ${tokens.length} link${tokens.length === 1 ? "" : "s"}.`);
    else toast.error(`Revoked ${tokens.length - failed} of ${tokens.length}; ${failed} failed.`);
  }

  if (!me.data) return null;

  const totalCount = shares?.length ?? 0;
  const filteredCount = filtered?.length ?? 0;

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

      {/* ── Filter strip ─────────────────────────────────────────── */}
      <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <HugeiconsIcon
            icon={Search01Icon}
            strokeWidth={2}
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            type="search"
            placeholder="Search by label or target…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <SegmentedFilter
          value={typeFilter}
          onChange={setTypeFilter}
          options={[
            { value: "all", label: "All" },
            { value: "file", label: "Files" },
            { value: "folder", label: "Folders" },
          ]}
        />
        <SegmentedFilter
          value={permFilter}
          onChange={setPermFilter}
          options={[
            { value: "all", label: "All" },
            { value: "read", label: "View" },
            { value: "write", label: "Edit" },
          ]}
        />
      </div>

      {/* ── Body ─────────────────────────────────────────────────── */}
      {sharesQuery.isPending ? (
        <SharesSkeleton />
      ) : sharesQuery.isError ? (
        <ElevatedCard className="px-6 py-10 text-center">
          <p className="text-sm text-destructive">
            {errorMessage(sharesQuery.error, "Could not load shares.")}
          </p>
        </ElevatedCard>
      ) : !groups || groups.length === 0 ? (
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
          {groups.map((g) => {
            const allSelected = g.rows.every((r) => selected.has(r.token));
            const someSelected = !allSelected && g.rows.some((r) => selected.has(r.token));
            return (
              <section
                key={`${g.type}:${g.id}`}
                className="rounded-xl bg-card ring-1 ring-border/60 shadow-[0_4px_18px_-12px_rgba(28,24,20,0.18)]"
              >
                <header className="flex flex-wrap items-center gap-2 border-b border-border/60 px-4 py-3">
                  <input
                    type="checkbox"
                    className="hidden size-4 sm:inline-block"
                    checked={allSelected}
                    ref={(el) => {
                      if (el) el.indeterminate = someSelected;
                    }}
                    onChange={(e) => toggleGroup(g.rows, e.target.checked)}
                    aria-label={`Select all links for ${g.name}`}
                  />
                  <HugeiconsIcon
                    icon={g.type === "folder" ? FolderIcon : Image01Icon}
                    strokeWidth={2}
                    className="size-4 text-muted-foreground"
                  />
                  <button
                    type="button"
                    onClick={() => navigate(g.type === "file" ? `/f/` : `/folders/${g.id}`)}
                    className="min-w-0 flex-1 truncate text-left text-sm font-medium text-foreground hover:underline underline-offset-4"
                    title={`Open ${g.type}`}
                  >
                    {g.name}
                  </button>
                  <Badge variant="outline" className="shrink-0">
                    {g.rows.length} link{g.rows.length === 1 ? "" : "s"}
                  </Badge>
                </header>
                <ul className="flex flex-col gap-3 p-4">
                  {g.rows.map((sh) => (
                    <div key={sh.token} className="flex items-start gap-2">
                      <input
                        type="checkbox"
                        className="mt-5 hidden size-4 shrink-0 sm:inline-block"
                        checked={selected.has(sh.token)}
                        onChange={(e) => toggleSelected(sh.token, e.target.checked)}
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
          })}
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

// ─── Helpers ───────────────────────────────────────────────────────────

function SegmentedFilter<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <div className="inline-flex items-center rounded-md border border-border bg-card/50 p-0.5">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          data-active={value === opt.value}
          className={cn(
            "rounded px-3 py-1.5 text-xs font-medium transition-colors",
            "data-[active=true]:bg-accent data-[active=true]:text-accent-foreground",
            "text-muted-foreground hover:text-foreground",
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
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
