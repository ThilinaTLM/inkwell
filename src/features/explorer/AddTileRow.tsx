// AddTileRow — list-mode equivalent of `AddTile`. A single thin row
// with a dashed border and a `+ Folder` / `+ Scene` label, sized to
// match `ListItemRow` so the affordance sits flush at the top of the
// list.

import { type ReactNode } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { PlusSignIcon } from "@hugeicons/core-free-icons";

import { cn } from "@/lib/utils";

interface AddTileRowProps {
  label: string;
  icon?: ReactNode;
  onClick: () => void;
  className?: string;
}

export function AddTileRow({ label, icon, onClick, className }: AddTileRowProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={cn(
        "group/add flex w-full items-center gap-3 rounded-md border-2 border-dashed border-ink-soft/35 px-4 py-2 text-ink-soft transition-colors",
        "hover:border-vermillion/60 hover:text-vermillion",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vermillion/60",
        className
      )}
    >
      <span className="grid h-10 w-12 shrink-0 place-items-center text-ink-soft transition-colors group-hover/add:text-vermillion">
        {icon ?? (
          <HugeiconsIcon icon={PlusSignIcon} strokeWidth={1.8} className="size-5" />
        )}
      </span>
      <span className="font-heading text-sm">{label}</span>
    </button>
  );
}
