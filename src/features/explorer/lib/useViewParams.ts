// useViewParams — list-view state (layout, sort, search, kind filter)
// expressed as URL search params.
//
// Everything a view shows is reproducible from its URL, so a filtered,
// sorted view can be bookmarked, shared with yourself on another
// machine, or walked with browser back/forward. The only thing kept in
// localStorage is the *default* layout (grid vs list), because that is a
// personal preference rather than part of the query.

import { useCallback } from "react";
import { useSearchParams } from "react-router-dom";

import type { FileKind } from "@/lib/api/client";
import { isFileKind } from "@/lib/file-kinds";

export type ViewLayout = "grid" | "list";
export type SortKey = "updated" | "created" | "name" | "kind";

export const SORT_LABELS: Record<SortKey, string> = {
  updated: "Last updated",
  created: "Recently created",
  name: "Name",
  kind: "Type",
};

const LAYOUT_KEY = "inkwell:explorer:view";

function readStoredLayout(fallback: ViewLayout): ViewLayout {
  try {
    const v = localStorage.getItem(LAYOUT_KEY);
    return v === "grid" || v === "list" ? v : fallback;
  } catch {
    return fallback;
  }
}

export interface ViewParams {
  layout: ViewLayout;
  sort: SortKey;
  q: string;
  kind: FileKind | null;
  setLayout: (l: ViewLayout) => void;
  setSort: (s: SortKey) => void;
  setQ: (q: string) => void;
  setKind: (k: FileKind | null) => void;
  /** True when any filter narrows the result set. */
  filtered: boolean;
  clearFilters: () => void;
}

export function useViewParams(defaults: { layout?: ViewLayout; sort?: SortKey } = {}): ViewParams {
  const [params, setParams] = useSearchParams();

  const layoutParam = params.get("view");
  const layout: ViewLayout =
    layoutParam === "grid" || layoutParam === "list"
      ? layoutParam
      : readStoredLayout(defaults.layout ?? "grid");

  const sortParam = params.get("sort");
  const sort: SortKey =
    sortParam === "updated" ||
    sortParam === "created" ||
    sortParam === "name" ||
    sortParam === "kind"
      ? sortParam
      : (defaults.sort ?? "updated");

  const q = params.get("q") ?? "";
  const kindParam = params.get("kind");
  const kind = isFileKind(kindParam) ? kindParam : null;

  const patch = useCallback(
    (next: Record<string, string | null>) => {
      setParams(
        (prev) => {
          const out = new URLSearchParams(prev);
          for (const [k, v] of Object.entries(next)) {
            if (v === null || v === "") out.delete(k);
            else out.set(k, v);
          }
          return out;
        },
        { replace: true },
      );
    },
    [setParams],
  );

  const setLayout = useCallback(
    (l: ViewLayout) => {
      try {
        localStorage.setItem(LAYOUT_KEY, l);
      } catch {
        /* storage unavailable */
      }
      patch({ view: l });
    },
    [patch],
  );

  return {
    layout,
    sort,
    q,
    kind,
    setLayout,
    setSort: (s) => patch({ sort: s }),
    setQ: (next) => patch({ q: next }),
    setKind: (k) => patch({ kind: k }),
    filtered: q.trim().length > 0 || kind !== null,
    clearFilters: () => patch({ q: null, kind: null }),
  };
}
