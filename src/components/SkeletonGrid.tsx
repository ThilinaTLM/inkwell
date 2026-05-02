// 12-card pulsing skeleton used by all three explorer views while their
// data is loading. Replaces three near-identical inline copies.

import { Skeleton } from "@/components/ui/skeleton";

interface SkeletonGridProps {
  /** Number of cards to render. Defaults to 12. */
  count?: number;
}

export function SkeletonGrid({ count = 12 }: SkeletonGridProps) {
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-4">
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} className="aspect-[4/3] rounded-2xl" />
      ))}
    </div>
  );
}
