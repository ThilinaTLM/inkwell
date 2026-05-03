// Picks a destination folder. Used both for moving a scene and for
// re-parenting a folder. Disables invalid targets when `forbidden` is set
// (e.g. you can't move a folder into its own descendants).

import { FolderAddIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FolderTree } from "@/features/folders/FolderTree";
import type { FolderMeta } from "@/lib/api/client";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  folders: FolderMeta[];
  /** Currently-selected folder id (initial highlight). `null` selects
   *  the virtual "Top level" row. */
  initialId?: string | null;
  /** Folder ids that cannot be selected (self + descendants when moving). */
  forbiddenIds?: Set<string>;
  /** Title shown in the dialog header. */
  title: string;
  description?: string;
  /** Called with the chosen folder id, or `null` for the root level. */
  onSubmit: (folderId: string | null) => Promise<void> | void;
}

export function MoveToFolderDialog({
  open,
  onOpenChange,
  folders,
  initialId,
  forbiddenIds,
  title,
  description,
  onSubmit,
}: Props) {
  // We need to distinguish "nothing chosen yet" from "chose Top level".
  // Use a separate boolean so `null` can mean root.
  const [selected, setSelected] = useState<string | null>(initialId ?? null);
  const [touched, setTouched] = useState(initialId !== undefined);
  const [busy, setBusy] = useState(false);

  function close() {
    if (busy) return;
    onOpenChange(false);
  }

  async function submit() {
    if (!touched) return;
    setBusy(true);
    try {
      await onSubmit(selected);
      onOpenChange(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) setSelected(initialId ?? null);
        onOpenChange(v);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <HugeiconsIcon
              icon={FolderAddIcon}
              strokeWidth={1.8}
              className="size-5 text-ink-soft"
            />
            {title}
          </DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>
        <div className="max-h-[50vh] overflow-y-auto rounded-md border border-ink-soft/20 bg-paper/50 p-1.5">
          <FolderTree
            folders={folders}
            selectedId={selected}
            onSelect={(id) => {
              setSelected(id);
              setTouched(true);
            }}
            disabledFor={(f) => !!forbiddenIds?.has(f.id)}
            showCounts={false}
            rootLabel="Top level"
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={close} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!touched || busy}>
            {busy ? "Moving…" : "Move here"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
