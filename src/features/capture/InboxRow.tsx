// Compact Inbox row for Home: kind icon, name, relative time, "Move to project".

import { FolderTransferIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { KindIcon } from "@/features/collection/CollectionPreview";
import { fileToCollectionItem, kindLabel } from "@/features/collection/model";
import { openDialog } from "@/features/dialogs/dialogStore";
import type { FileMeta } from "@/lib/api/client";
import { relTime } from "@/lib/format";

export function InboxRow({ file }: { file: FileMeta }) {
  const item = fileToCollectionItem(file);
  return (
    <div className="group/ib flex items-center gap-3 border-b border-border px-4 py-2 last:border-b-0 hover:bg-accent/50">
      <span className="grid size-7 shrink-0 place-items-center rounded-md bg-surface-2">
        <KindIcon item={item} className="size-4" />
      </span>
      <Link
        to={`/f/${file.id}`}
        className="min-w-0 flex-1 rounded outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
      >
        <span className="block truncate text-[13.5px] font-medium text-foreground">
          {file.name}
        </span>
        <span className="block truncate text-xs text-muted-foreground">
          {kindLabel(item.kind)} · {relTime(file.updatedAt)}
        </span>
      </Link>
      <Button
        variant="outline"
        size="sm"
        className="shrink-0 rounded-[9px]"
        onClick={() => openDialog("move", { items: [{ type: "file", id: file.id }] })}
      >
        <HugeiconsIcon icon={FolderTransferIcon} strokeWidth={1.8} />
        <span className="max-sm:sr-only">Move to project</span>
      </Button>
    </div>
  );
}
