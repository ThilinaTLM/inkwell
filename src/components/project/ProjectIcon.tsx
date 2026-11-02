// Soft coloured tile with the project's curated icon.
//
//   <ProjectIcon folder={folder} size="md" />
//   <ProjectIcon icon="rocket" color="orange" size="lg" />
//
// Falls back to a neutral slate folder tile when the folder has no
// icon/colour set (including older payloads without those fields).

import { HugeiconsIcon } from "@hugeicons/react";
import { cn } from "@/lib/utils";
import { type ProjectFields, resolveProjectColor, resolveProjectIcon } from "./projectStyle";

const SIZES = {
  xs: { box: "size-5 rounded-md", icon: "size-3" },
  sm: { box: "size-6 rounded-md", icon: "size-3.5" },
  md: { box: "size-9 rounded-[10px]", icon: "size-[18px]" },
  lg: { box: "size-12 rounded-xl", icon: "size-6" },
  xl: { box: "size-14 rounded-2xl", icon: "size-7" },
} as const;

export type ProjectIconSize = keyof typeof SIZES;

export interface ProjectIconProps {
  folder?: ProjectFields | null;
  icon?: string | null;
  color?: string | null;
  size?: ProjectIconSize;
  className?: string;
}

export function ProjectIcon({ folder, icon, color, size = "md", className }: ProjectIconProps) {
  const style = resolveProjectColor(color ?? folder?.color);
  const s = SIZES[size];
  return (
    <span
      aria-hidden
      className={cn("grid shrink-0 place-items-center", s.box, style.tile, style.text, className)}
    >
      <HugeiconsIcon
        icon={resolveProjectIcon(icon ?? folder?.icon)}
        strokeWidth={1.8}
        className={s.icon}
      />
    </span>
  );
}
