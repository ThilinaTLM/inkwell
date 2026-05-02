// Edit a target's tag set. Generic across scene and folder targets;
// the parent passes the load + save callbacks so this component stays
// decoupled from the specific endpoint.

import { useEffect, useState } from "react";
import { toast } from "sonner";

import { errorMessage } from "@/lib/errors";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { TagPicker } from "@/features/tags/TagPicker";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Current tags on the target; used to seed the picker. */
  initialTags: string[];
  /** Existing tag names for autocomplete. */
  suggestions: string[];
  title: string;
  description?: string;
  onSave: (tags: string[]) => Promise<string[]>;
  onSaved?: (tags: string[]) => void;
}

export function TagEditDialog({
  open,
  onOpenChange,
  initialTags,
  suggestions,
  title,
  description,
  onSave,
  onSaved,
}: Props) {
  const [draft, setDraft] = useState<string[]>(initialTags);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) setDraft(initialTags);
  }, [open, initialTags]);

  async function submit() {
    setBusy(true);
    try {
      const next = await onSave(draft);
      onSaved?.(next);
      onOpenChange(false);
    } catch (e) {
      toast.error(errorMessage(e, "could not update tags"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => (!busy ? onOpenChange(v) : null)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>
        <TagPicker value={draft} onChange={setDraft} suggestions={suggestions} />
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy}>
            {busy ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
