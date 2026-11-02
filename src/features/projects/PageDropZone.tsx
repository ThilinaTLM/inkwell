// Wraps a page so OS files dropped anywhere on it upload into `folderId`
// (`null` = Inbox). Shows a calm dashed frame while a file drag is over it.

import { CloudUploadIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { ReactNode } from "react";
import { useFileDropTarget } from "@/features/upload";

export function PageDropZone({
  folderId,
  name,
  children,
}: {
  folderId: string | null;
  name: string;
  children: ReactNode;
}) {
  const { isOver, bind } = useFileDropTarget({ folderId, folderName: name });
  return (
    <div {...bind} className="relative flex min-h-0 flex-1 flex-col">
      {children}
      {isOver ? (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-2 z-30 flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-primary bg-accent-soft/80 text-center backdrop-blur-[2px] animate-in fade-in-0 duration-100"
        >
          <HugeiconsIcon icon={CloudUploadIcon} strokeWidth={1.6} className="size-9 text-primary" />
          <p className="font-display text-2xl font-medium text-foreground">
            Drop to upload into “{name}”
          </p>
          <p className="text-xs text-muted-foreground">Folders keep their structure.</p>
        </div>
      ) : null}
    </div>
  );
}
