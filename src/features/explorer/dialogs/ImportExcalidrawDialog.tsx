// ImportExcalidrawDialog — create a file from an existing `.excalidraw`
// scene.
//
// The picked file is uploaded raw to `POST /api/files/import`; the
// worker parses and normalizes it (see `normalizeImportedExcalidraw`),
// so the parse here is a pre-flight, not a second validator: it derives
// the default name and the element count, and catches "this isn't JSON"
// before a 20 MB upload round-trip.
//
// The thumbnail is rendered from the parsed scene once the file row
// exists. An imported scene the user never opens would otherwise stay a
// placeholder glyph in the explorer, because thumbnails are otherwise
// only produced by the editor's post-save pipeline. Thumbnailing is
// best-effort: a failure leaves the same placeholder the file would
// have had anyway.

import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type { AppState, BinaryFiles } from "@excalidraw/excalidraw/types";
import { FileUploadIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useQueryClient } from "@tanstack/react-query";
import { type ChangeEvent, type FormEvent, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useImportExcalidraw } from "@/data/files";
import { invalidations } from "@/data/invalidations";
import { useMutationWithToast } from "@/data/useMutationWithToast";
import { renderExcalidrawThumbSvg } from "@/features/editor/excalidrawThumb";
import { type FileMeta, files as filesApi } from "@/lib/api/client";
import { cn } from "@/lib/utils";

/** Mirrors `MAX_FILE_BYTES` in `worker/services/file-blob.ts`. The worker
 *  stays authoritative — this pre-check exists only so a huge file is
 *  refused before `file.text()` + `JSON.parse` pull it into memory and
 *  block the UI, just to earn a 413 afterwards. If the worker cap moves,
 *  move this with it. */
const MAX_IMPORT_BYTES = 25 * 1024 * 1024;

/** The slice of a `.excalidraw` export envelope the dialog reads. The
 *  worker owns the authoritative shape rules
 *  (`normalizeImportedExcalidraw`); this is only what the client needs
 *  to preview and thumbnail a scene before/after upload. */
interface ExcalidrawExport {
  elements: ExcalidrawElement[];
  appState?: Partial<AppState>;
  files?: BinaryFiles;
}

interface PickedScene {
  file: File;
  scene: ExcalidrawExport;
}

interface ImportExcalidrawDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Destination folder, or `null` for the root level. */
  folderId: string | null;
  onImported: (meta: FileMeta) => void;
}

export function ImportExcalidrawDialog({
  open,
  onOpenChange,
  folderId,
  onImported,
}: ImportExcalidrawDialogProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const qc = useQueryClient();
  const [picked, setPicked] = useState<PickedScene | null>(null);
  const [name, setName] = useState("");
  const [pickError, setPickError] = useState<string | null>(null);

  const importMutation = useImportExcalidraw();
  const runImport = useMutationWithToast(importMutation, {
    success: (meta) => `Imported "${meta.name}".`,
    fallback: "import failed",
  });

  function reset() {
    setPicked(null);
    setName("");
    setPickError(null);
  }

  async function onPickFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.currentTarget.files?.[0];
    // Clear immediately so re-picking the same file fires `change`.
    e.currentTarget.value = "";
    if (!file) return;

    if (file.size > MAX_IMPORT_BYTES) {
      setPicked(null);
      setPickError(
        `That file is ${(file.size / 1024 / 1024).toFixed(1)} MB. The limit is ${
          MAX_IMPORT_BYTES / 1024 / 1024
        } MB.`,
      );
      return;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(await file.text());
    } catch {
      setPicked(null);
      setPickError("That file isn't valid JSON.");
      return;
    }

    const scene = parsed as Record<string, unknown> | null;
    if (typeof scene !== "object" || scene === null || !Array.isArray(scene.elements)) {
      setPicked(null);
      setPickError("That file has no Excalidraw scene in it.");
      return;
    }
    if (scene.type !== undefined && scene.type !== "excalidraw") {
      setPicked(null);
      setPickError("That file has no Excalidraw scene in it.");
      return;
    }

    setPickError(null);
    setPicked({
      file,
      scene: {
        elements: scene.elements as ExcalidrawElement[],
        appState: (scene.appState as Partial<AppState> | undefined) ?? {},
        files: (scene.files as BinaryFiles | undefined) ?? {},
      },
    });
    setName(defaultNameFrom(file.name));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!picked || importMutation.isPending) return;
    const meta = await runImport({
      file: picked.file,
      name: name.trim() || "Untitled drawing",
      folderId,
    });
    if (!meta) return;

    // Best-effort: the file exists either way.
    try {
      const svg = await renderExcalidrawThumbSvg(
        picked.scene.elements,
        picked.scene.appState ?? {},
        picked.scene.files ?? {},
      );
      await filesApi.putThumb(meta.id, svg);
      invalidations.fileMutated(qc);
    } catch {
      // Leave the placeholder glyph in place.
    }

    reset();
    onImported(meta);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Import drawing</DialogTitle>
          <DialogDescription>
            Bring an existing <code className="font-mono">.excalidraw</code> file into Inkwell.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <input
            ref={inputRef}
            type="file"
            accept=".excalidraw,application/json"
            hidden
            onChange={onPickFile}
          />

          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className={cn(
              "flex items-center gap-3 rounded-xl border border-border/60 border-dashed",
              "bg-card/60 p-4 text-left transition hover:border-border hover:bg-card",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            )}
          >
            <HugeiconsIcon icon={FileUploadIcon} strokeWidth={1.7} className="size-5 shrink-0" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-foreground">
                {picked ? picked.file.name : "Choose a .excalidraw file"}
              </span>
              <span className="block text-xs text-muted-foreground">
                {picked
                  ? `${picked.scene.elements.length} element${picked.scene.elements.length === 1 ? "" : "s"}`
                  : "Exported from Excalidraw, Excalidraw+, or Inkwell."}
              </span>
            </span>
          </button>

          {pickError ? (
            <p className="text-xs text-destructive" role="alert">
              {pickError}
            </p>
          ) : null}

          <div className="flex flex-col gap-2">
            <Label htmlFor="import-excalidraw-name">Name</Label>
            <Input
              id="import-excalidraw-name"
              value={name}
              onChange={(e) => setName(e.currentTarget.value)}
              placeholder="Untitled drawing"
              disabled={!picked}
            />
          </div>

          {/* Submit lives inside the form so Enter in the Name field
           *  imports, matching `<RenameDialog>`. Implicit submission is
           *  blocked while the button is disabled (no file picked), and
           *  `onSubmit` re-checks — so Enter cannot fire a partial submit. */}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!picked || importMutation.isPending}>
              {importMutation.isPending ? "Importing…" : "Import"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** "my drawing.excalidraw" → "my drawing". Falls back when the stem is
 *  empty (a file literally named `.excalidraw`). */
function defaultNameFrom(filename: string): string {
  const stem = filename.replace(/\.excalidraw$/i, "").trim();
  return stem || "Untitled drawing";
}
