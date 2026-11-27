// "Export as…" — a small dialog of format pills supplied by the active
// editor through `bridge.exporters` (opened from the ⋯ menu or
// Ctrl/⌘+Shift+S).

import { Loading03Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { errorMessage } from "@/lib/errors";
import type { EditorExporter } from "./editorHeaderBridge";

export interface ExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fileName: string;
  exporters: EditorExporter[];
}

export function ExportDialog({ open, onOpenChange, fileName, exporters }: ExportDialogProps) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const hint = exporters.find((x) => x.id === hovered)?.hint;

  const run = async (x: EditorExporter) => {
    if (busyId) return;
    setBusyId(x.id);
    try {
      await x.run();
      onOpenChange(false);
    } catch (e) {
      toast.error(errorMessage(e, `Could not export ${x.label}`));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => (busyId ? undefined : onOpenChange(next))}>
      <DialogContent className="sm:max-w-md" data-testid="export-dialog">
        <DialogHeader>
          <DialogTitle>Export as…</DialogTitle>
          <DialogDescription className="truncate">{fileName}</DialogDescription>
        </DialogHeader>
        <fieldset className="flex flex-wrap gap-2 border-0 p-0">
          <legend className="sr-only">Export format</legend>
          {exporters.map((x) => (
            <Button
              key={x.id}
              variant="outline"
              size="lg"
              disabled={!!busyId && busyId !== x.id}
              onClick={() => void run(x)}
              onMouseEnter={() => setHovered(x.id)}
              onMouseLeave={() => setHovered(null)}
              onFocus={() => setHovered(x.id)}
              onBlur={() => setHovered(null)}
              data-testid={`export-${x.id}`}
              className="min-w-20 rounded-full"
            >
              {busyId === x.id ? (
                <HugeiconsIcon icon={Loading03Icon} strokeWidth={2} className="animate-spin" />
              ) : null}
              {x.label}
            </Button>
          ))}
        </fieldset>
        <p className="min-h-5 text-xs text-muted-foreground">
          {hint ?? "Choose a format to download."}
        </p>
      </DialogContent>
    </Dialog>
  );
}
