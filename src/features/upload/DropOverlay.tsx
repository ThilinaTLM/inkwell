// Screen 07 drop overlay: dashed burnt-orange frame naming the target
// folder, with a legend of what each extension becomes. Absolutely
// positioned — place it inside a `relative` container (the pane).
// Purely visual (`pointer-events-none`); the drop is handled by the
// container's `useFileDropTarget` bindings.

import { CloudUploadIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { cn } from "@/lib/utils";

const LEGEND: Array<{ ext: string; kind: string }> = [
  { ext: ".excalidraw / .json", kind: "Excalidraw" },
  { ext: ".drawio / .xml", kind: "Draw.io" },
  { ext: ".md / .txt", kind: "Notes" },
  { ext: ".zip / .html / folder with index.html", kind: "Static site" },
];

export interface DropOverlayProps {
  targetName: string;
  visible: boolean;
  className?: string;
}

export function DropOverlay({ targetName, visible, className }: DropOverlayProps) {
  if (!visible) return null;
  return (
    <div
      aria-hidden
      className={cn(
        "pointer-events-none absolute inset-2 z-30 flex flex-col items-center justify-center gap-3 p-6 text-center",
        "rounded-2xl border-[2.5px] border-dashed border-primary bg-accent/70 backdrop-blur-[2px]",
        "animate-in fade-in-0 duration-100",
        className,
      )}
    >
      <HugeiconsIcon
        icon={CloudUploadIcon}
        strokeWidth={1.6}
        className="size-10 text-accent-foreground opacity-80"
      />
      <h3 className="font-display text-3xl leading-tight font-medium text-foreground sm:text-4xl">
        Drop to upload into “{targetName}”
      </h3>
      <ul className="flex max-w-2xl flex-wrap justify-center gap-2">
        {LEGEND.map((l) => (
          <li
            key={l.kind}
            className="inline-flex h-6 items-center rounded-full border border-primary/50 bg-background/80 px-2.5 text-xs whitespace-nowrap text-accent-foreground"
          >
            {l.ext} → {l.kind}
          </li>
        ))}
      </ul>
      <p className="text-xs text-muted-foreground">
        Folders keep their structure · unsupported files are listed, not silently dropped
      </p>
    </div>
  );
}
