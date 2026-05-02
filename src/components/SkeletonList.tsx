// 12-row pulsing skeleton used by explorer views in list layout while
// their data is loading. Mirrors `SkeletonGrid`'s shape and density.

import { Skeleton } from "@/components/ui/skeleton";

interface SkeletonListProps {
  /** Number of rows to render. Defaults to 12. */
  count?: number;
}

export function SkeletonList({ count = 12 }: SkeletonListProps) {
  return (
    <div className="flex flex-col gap-1.5">
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} className="h-12 w-full rounded-md" />
      ))}
    </div>
  );
}
