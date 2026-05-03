// Generic table-row skeleton used in the admin tables while data loads.
//
// Local to the admin feature: the explorer has its own grid skeleton
// (`<SkeletonGrid>`) and tables aren't currently used outside admin.

import { useMemo } from "react";

import { Skeleton } from "@/components/ui/skeleton";

export function TableSkeleton({ rows, cols }: { rows: number; cols: number }) {
  // Stable, deterministic keys for a fixed-shape placeholder grid that never reorders.
  const grid = useMemo(
    () =>
      Array.from({ length: rows }, (_, r) => ({
        rowKey: `row-${r}`,
        cells: Array.from({ length: cols }, (_, c) => ({
          cellKey: `cell-${r}-${c}`,
          maxWidth: `${20 + ((r + c) % 4) * 12}%`,
        })),
      })),
    [rows, cols],
  );
  return (
    <div className="space-y-2">
      {grid.map((row) => (
        <div key={row.rowKey} className="flex gap-3">
          {row.cells.map((cell) => (
            <Skeleton
              key={cell.cellKey}
              className="h-4 flex-1"
              style={{ maxWidth: cell.maxWidth }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
