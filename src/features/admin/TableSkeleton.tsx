// Generic table-row skeleton used in the admin tables while data loads.
//
// Local to the admin feature: the explorer has its own grid skeleton
// (`<SkeletonGrid>`) and tables aren't currently used outside admin.

import { Skeleton } from "@/components/ui/skeleton";

export function TableSkeleton({
  rows,
  cols,
}: {
  rows: number;
  cols: number;
}) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex gap-3">
          {Array.from({ length: cols }).map((_, c) => (
            <Skeleton
              key={c}
              className="h-4 flex-1"
              style={{ maxWidth: `${20 + ((r + c) % 4) * 12}%` }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
