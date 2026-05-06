// SSR-safe `matchMedia` hook used by features that branch on
// viewport width or input modality (touch vs. mouse).
//
// Mirrors the dark-query handling in `src/lib/theme.tsx` — same
// `mql.addEventListener("change", …)` pattern and same first-mount
// fallback for environments without `window.matchMedia` (tests,
// non-browser SSR shims).

import { useEffect, useState } from "react";

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => {
    if (typeof window === "undefined" || !window.matchMedia) return false;
    return window.matchMedia(query).matches;
  });

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mql = window.matchMedia(query);
    const apply = () => setMatches(mql.matches);
    // Sync once in case the query string changed between renders.
    apply();
    mql.addEventListener("change", apply);
    return () => mql.removeEventListener("change", apply);
  }, [query]);

  return matches;
}
