// SceneNameLabel — a paper pill rendered in the Editor's `topLeftChrome`
// overlay (right of Excalidraw's hamburger trigger) showing the current
// scene's name. Sits next to the back button so the user always sees what
// document they're editing. Sized to 36px tall to match Excalidraw's
// --lg-button-size below 1921px viewports, keeping the cluster as a single
// horizontal row with the hamburger.

import { BookOpen01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { cn } from "@/lib/utils";

interface SceneNameLabelProps {
  name: string;
  className?: string;
}

export function SceneNameLabel({ name, className }: SceneNameLabelProps) {
  return (
    <div
      title={name}
      className={cn(
        "pointer-events-auto inline-flex h-9 max-w-[18rem] items-center gap-1.5 rounded-md bg-paper-elev/90 px-3 ring-1 ring-ink-soft/15 backdrop-blur",
        className,
      )}
    >
      <HugeiconsIcon
        icon={BookOpen01Icon}
        strokeWidth={1.6}
        className="size-4 shrink-0 text-ink-soft"
      />
      <span className="truncate font-heading text-sm leading-none text-ink">{name}</span>
    </div>
  );
}
