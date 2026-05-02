// SceneNameLabel — a small paper pill rendered inside Excalidraw's <Footer>
// showing the current scene's name. Sits next to the save-status badge so
// the user always sees what document they're editing without any chrome
// outside the canvas.

import { HugeiconsIcon } from "@hugeicons/react";
import { BookOpen01Icon } from "@hugeicons/core-free-icons";
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
        "pointer-events-none mr-2 inline-flex max-w-[18rem] items-center gap-1.5 rounded-md bg-paper-elev/90 px-2 py-1 ring-1 ring-ink-soft/15 backdrop-blur",
        className
      )}
    >
      <HugeiconsIcon
        icon={BookOpen01Icon}
        strokeWidth={1.6}
        className="size-3 shrink-0 text-ink-soft"
      />
      <span className="truncate font-heading text-[0.8125rem] leading-none text-ink">
        {name}
      </span>
    </div>
  );
}
