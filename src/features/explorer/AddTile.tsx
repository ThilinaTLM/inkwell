// AddTile — dashed `+ Folder` / `+ Scene` tile that ends the Browse grid.
//
// Same outer dimensions as `FolderCard` and `SceneCard` so it sits flush
// in the grid. Uses a crisp dashed border (CSS) to read as an affordance
// rather than a real artifact — RoughBox is reserved for content.

import { type ReactNode } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { PlusSignIcon } from "@hugeicons/core-free-icons";

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
        "group/add relative flex flex-col items-center justify-center rounded-md text-ink-soft transition-all duration-200",
        "min-h-[12rem] border-2 border-dashed border-ink-soft/35",
        "hover:-translate-y-1 hover:border-vermillion/60 hover:text-vermillion",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vermillion/60",
        className
      )}
    >
      <span className="grid size-12 place-items-center text-ink-soft transition-colors group-hover/add:text-vermillion">
        {icon ?? (
          <HugeiconsIcon icon={PlusSignIcon} strokeWidth={1.8} className="size-7" />
        )}
      </span>
      <span className="mt-2 font-heading text-sm">{label}</span>
    </button>
  );
}
