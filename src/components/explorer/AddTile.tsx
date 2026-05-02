// AddTile — dashed `+ Folder` / `+ Scene` tile that ends the Browse grid.
//
// Same outer dimensions as `FolderCard` and `SceneCard` so it sits flush
// in the grid. Drawn with a dashed `RoughBox` border so it reads as an
// affordance rather than a real item, matching the wireframe.

import { type ReactNode } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { PlusSignIcon } from "@hugeicons/core-free-icons";

import { RoughBox } from "@/components/rough";
import { cn } from "@/lib/utils";

interface AddTileProps {
  label: string;
  icon?: ReactNode;
  onClick: () => void;
  className?: string;
}

export function AddTile({ label, icon, onClick, className }: AddTileProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={cn(
        "group/add relative isolate flex flex-col items-center justify-center overflow-hidden rounded-md text-ink-soft transition-all duration-200",
        "min-h-[12rem] hover:-translate-y-1 hover:text-vermillion",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vermillion/60",
        className
      )}
    >
      <RoughBox
        shape="card"
        seed={`add-tile:${label}`}
        stroke="var(--color-ink-soft)"
        strokeWidth={1.2}
        fill="transparent"
        roughness={1.6}
        bowing={2.5}
        radius={10}
        // Dashed feel — RoughBox doesn't take a dash array, so we lean
        // on a higher roughness + bowing to communicate "draft" silhouette.
      />
      <span className="relative grid size-12 place-items-center text-ink-soft transition-colors group-hover/add:text-vermillion">
        {icon ?? (
          <HugeiconsIcon icon={PlusSignIcon} strokeWidth={1.8} className="size-7" />
        )}
      </span>
      <span className="relative mt-2 font-heading text-sm">{label}</span>
    </button>
  );
}
