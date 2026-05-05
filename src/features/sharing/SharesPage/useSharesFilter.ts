// Filter + grouping state for the SharesPage.
//
// Lives outside the page component so it can be unit-reasoned about
// without dragging in the rest of the layout. The filter is purely
// client-side; the data set is one user's shares (typically a few
// dozen at most), so the API doesn't need query params for this.

import { useMemo, useState } from "react";
import type { Share, ShareTargetType } from "@/lib/api/client";

export type TargetTypeFilter = "all" | "file" | "folder";
export type PermissionFilter = "all" | "read" | "write";

export interface ShareGroup {
  type: ShareTargetType;
  id: string;
  name: string;
  rows: Share[];
}

export function useSharesFilter(shares: Share[] | null) {
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<TargetTypeFilter>("all");
  const [permFilter, setPermFilter] = useState<PermissionFilter>("all");

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
  const groups = useMemo<ShareGroup[] | null>(() => {
    if (!filtered) return null;
    const map = new Map<string, ShareGroup>();
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

  return {
    search,
    setSearch,
    typeFilter,
    setTypeFilter,
    permFilter,
    setPermFilter,
    filtered,
    groups,
  };
}

// ─── Selection state ─────────────────────────────────────────────────
// Lives separately because bulk-revoke runs at the page level (it
// needs the full token list across all groups), while per-row
// checkboxes consume the same set inside each group.
export function useSharesSelection() {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  function toggleOne(token: string, on: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(token);
      else next.delete(token);
      return next;
    });
  }

  function toggleMany(tokens: readonly string[], on: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const t of tokens) {
        if (on) next.add(t);
        else next.delete(t);
      }
      return next;
    });
  }

  function clear() {
    setSelected(new Set());
  }

  return { selected, toggleOne, toggleMany, clear };
}
