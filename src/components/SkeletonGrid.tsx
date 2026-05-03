// 12-card pulsing skeleton used by all three explorer views while their
// data is loading. Replaces three near-identical inline copies.

import { useMemo } from "react";

import { Skeleton } from "@/components/ui/skeleton";

interface SkeletonGridProps {
  /** Number of cards to render. Defaults to 12. */
  count?: number;
}

export function SkeletonGrid({ count = 12 }: SkeletonGridProps) {
  // Stable, deterministic keys for a fixed-length placeholder list. The list
  // never reorders, so any unique-per-slot string works.
  const keys = useMemo(() => Array.from({ length: count }, (_, i) => `skeleton-${i}`), [count]);
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-4">
      {keys.map((k) => (
        <Skeleton key={k} className="aspect-[4/3] rounded-2xl" />
      ))}
    </div>
  );
}
