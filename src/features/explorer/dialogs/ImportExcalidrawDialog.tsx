// ImportExcalidrawDialog — create files from existing `.excalidraw`
// scenes, one or many at a time.
//
// Each picked file is uploaded raw to `POST /api/files/import`; the
// worker parses and normalizes it (see `normalizeImportedExcalidraw`),
// so the parse here is a pre-flight, not a second validator: it derives
// the default name, counts elements, and rejects a bad file before a
// 25 MB upload round-trip.
//
// Bulk is a client-side loop over that same single-file endpoint rather
// than a multipart batch endpoint, for two reasons:
//
//   1. Per-file outcomes. A batch endpoint is all-or-nothing (or needs
//      bespoke partial-failure semantics); looping lets each file land
//      on its own. Importing a folder of drawings should not let two
//      broken files hold eight good ones hostage.
//   2. One upload shape. The single-file path is what the rest of the
//      app already exercises, so bulk reuses it verbatim instead of
//      adding a second body format to keep in sync.
//
// The loop is sequential: each request carries a whole scene body and
// the thumbnail render is main-thread work regardless, so parallelism
// would buy little while making progress reporting murkier.
//
// Thumbnails are rendered from each parsed scene once its file row
// exists. An imported scene the user never opens would otherwise stay a
// placeholder glyph in the explorer, because thumbnails are otherwise
// only produced by the editor's post-save pipeline. Best-effort: a
// failure leaves the same placeholder the file would have had anyway.

import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type { AppState, BinaryFiles } from "@excalidraw/excalidraw/types";
import { Cancel01Icon, FileUploadIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useQueryClient } from "@tanstack/react-query";
import { type ChangeEvent, type FormEvent, useRef, useState } from "react";
import { toast } from "sonner";

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
import { invalidations } from "@/data/invalidations";
import { renderExcalidrawThumbSvg } from "@/features/editor/excalidrawThumb";
import { files as filesApi } from "@/lib/api/client";
import { errorMessage } from "@/lib/errors";
import { cn } from "@/lib/utils";

/** Mirrors `MAX_FILE_BYTES` in `worker/services/file-blob.ts`. The worker
 *  stays authoritative — this pre-check exists only so a huge file is
 *  refused before `file.text()` + `JSON.parse` pull it into memory, just
 *  to earn a 413 afterwards. If the worker cap moves, move this with it. */
const MAX_IMPORT_BYTES = 25 * 1024 * 1024;

/** The slice of a `.excalidraw` export envelope this dialog reads. The
 *  worker owns the authoritative shape rules
 *  (`normalizeImportedExcalidraw`); this is only what the client needs
 *  to preview and thumbnail a scene before/after upload. */
interface ExcalidrawExport {
  elements: ExcalidrawElement[];
  appState?: Partial<AppState>;
  files?: BinaryFiles;
}

interface PickedFile {
  /** Stable React key — files in one batch can share a name. */
  key: number;
  file: File;
  /** Parsed scene, or `null` when the pre-flight rejected the file. */
  scene: ExcalidrawExport | null;
  /** Pre-flight rejection reason, or `null` when the file is importable. */
  error: string | null;
  /** Dedup key — see `readScene`. */
  identity: string;
}

interface Outcome {
  entry: PickedFile;
  /** The name actually attempted — row name on success. */
  label: string;
  id: string | null;
  error: string | null;
}

interface ImportExcalidrawDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Destination folder, or `null` for the root level. */
  folderId: string | null;
  /** Called with the new file's id after a lone file imports. Batches
   *  stay on the explorer — there is no single file to navigate to. */
  onImported: (fileId: string) => void;
}

export function ImportExcalidrawDialog({
  open,
  onOpenChange,
  folderId,
  onImported,
}: ImportExcalidrawDialogProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const nextKey = useRef(0);
  const qc = useQueryClient();
  // Set when the dialog closes, so an in-flight batch stops issuing
  // further requests and skips its end-of-run toast/navigation. Without
  // it, closing mid-import still navigated the user into the editor of
  // whichever file finished last.
  const abortedRef = useRef(false);
  const [picked, setPicked] = useState<PickedFile[]>([]);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  const importable = picked.filter(hasScene);
  // The Name field only makes sense for a lone file; a batch is named
  // after its filenames, one name per file.
  const singleFile = picked.length === 1 && picked[0].scene !== null;

  function reset() {
    setPicked([]);
    setName("");
    setProgress(null);
  }

  /** The single close path. Every way out — Cancel, the X, Escape, the
   *  overlay — goes through here so `reset()` always runs; previously
   *  Cancel called the parent handler directly and left the picked list
   *  behind, so reopening the dialog offered to re-import the files the
   *  user had just cancelled. */
  function requestClose() {
    abortedRef.current = true;
    reset();
    onOpenChange(false);
  }

  async function onPickFiles(e: ChangeEvent<HTMLInputElement>) {
    const list = e.currentTarget.files;
    // Snapshot to an array BEFORE clearing: `value = ""` empties the live
    // `FileList`, so iterating it afterwards yields nothing. Clearing
    // first is what lets the same file be picked again (no `change`
    // event otherwise).
    const files = list ? Array.from(list) : [];
    e.currentTarget.value = "";
    if (files.length === 0) return;

    const entries = await Promise.all(
      files.map(async (file) => {
        const { scene, error, identity } = await readScene(file);
        return { key: nextKey.current++, file, scene, error, identity };
      }),
    );

    // Append rather than replace, so one selection can be assembled from
    // several folders; skip files already queued.
    setPicked((prev) => {
      const seen = new Set(prev.map((p) => p.identity));
      const next = [...prev];
      for (const entry of entries) {
        if (seen.has(entry.identity)) continue;
        seen.add(entry.identity);
        next.push(entry);
      }
      return next;
    });
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (busy || importable.length === 0) return;
    abortedRef.current = false;
    setBusy(true);

    const outcomes: Outcome[] = [];
    try {
      for (let i = 0; i < importable.length; i++) {
        // Stop issuing requests once the dialog closes. The request
        // already in flight still completes (aborting it would not
        // un-create the file, and the client has no signal plumbed
        // through), but a 50-file batch stops hammering the worker.
        if (abortedRef.current) break;
        const entry = importable[i];
        const label = singleFile && name.trim() ? name.trim() : defaultNameFrom(entry.file.name);
        setProgress({ done: i, total: importable.length });
        try {
          const meta = await filesApi.importExcalidraw(entry.file, { name: label, folderId });
          await putThumbnail(entry.scene, meta.id);
          outcomes.push({ entry, label: meta.name, id: meta.id, error: null });
        } catch (err) {
          outcomes.push({ entry, label, id: null, error: errorMessage(err, "import failed") });
        }
      }
    } finally {
      setProgress(null);
      setBusy(false);
      invalidations.fileMutated(qc);
    }

    // Closed mid-run: `requestClose` already cleared the list, and the
    // user asked to leave — so no toast and, critically, no navigation.
    if (abortedRef.current) return;

    const ok = outcomes.filter((o) => !o.error);
    const failed = outcomes.filter((o) => o.error);
    // Files the pre-flight already refused never reached the loop, but
    // the user picked them — counting only `outcomes` would report
    // "Imported 3 files" for a 5-file selection and silently drop the
    // two bad ones.
    const rejected = picked.filter((p) => p.scene === null);
    const attempted = picked.length;

    if (failed.length === 0 && rejected.length === 0) {
      toast.success(
        ok.length === 1 ? `Imported "${ok[0].label}".` : `Imported ${ok.length} files.`,
      );
      const lone = ok.length === 1 ? ok[0].id : null;
      reset();
      // A lone file hands the id up so the caller can open it; a batch
      // has no single destination, so it just closes and leaves the
      // refreshed explorer behind.
      if (lone) onImported(lone);
      else onOpenChange(false);
      return;
    }

    // Something is left over: keep the rejected and failed entries listed
    // so one bad file can be fixed or removed without re-picking the rest.
    const failedKeys = new Set(failed.map((f) => f.entry.key));
    setPicked((prev) => prev.filter((p) => p.scene === null || failedKeys.has(p.key)));
    const reasons = [
      ...rejected.map((r) => `${r.file.name} (${r.error})`),
      ...failed.map((f) => `${f.label} (${f.error})`),
    ];
    const summary = `Imported ${ok.length} of ${attempted}.`;
    if (ok.length === 0) toast.error(`${summary} ${reasons.join("; ")}`);
    else toast.warning(`${summary} ${reasons.join("; ")}`);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        // The X, Escape and overlay click land here; Cancel calls
        // `requestClose` directly. Both must reset, so route the closing
        // case through the same function.
        if (o) onOpenChange(true);
        else requestClose();
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Import drawings</DialogTitle>
          <DialogDescription>
            Bring existing <code className="font-mono">.excalidraw</code> files into Inkwell. Pick
            one or several.
          </DialogDescription>
        </DialogHeader>

        {/* `min-w-0` is load-bearing: `DialogContent` is a grid, so this
         *  form is a grid item with the default `min-width: auto`. A long
         *  filename is a single unbreakable token (`white-space: nowrap`
         *  from `truncate`), and its min-content width propagates up
         *  through the form and stretches the whole dialog — the row then
         *  spills out of the panel instead of ellipsising. Dropping the
         *  automatic minimum lets the width be decided by the dialog, so
         *  `truncate` can finally do its job. */}
        <form onSubmit={onSubmit} className="flex min-w-0 flex-col gap-4">
          <input
            ref={inputRef}
            type="file"
            accept=".excalidraw,application/json"
            multiple
            hidden
            onChange={onPickFiles}
          />

          <button
            type="button"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
            className={cn(
              "flex items-center gap-3 rounded-xl border border-border/60 border-dashed",
              "bg-card/60 p-4 text-left transition hover:border-border hover:bg-card",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              "disabled:opacity-60",
            )}
          >
            <HugeiconsIcon icon={FileUploadIcon} strokeWidth={1.7} className="size-5 shrink-0" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-foreground">
                {picked.length === 0 ? "Choose .excalidraw files" : "Add more files"}
              </span>
              <span className="block text-xs text-muted-foreground">
                Exported from Excalidraw, Excalidraw+, or Inkwell.
              </span>
            </span>
          </button>

          {/* Per-file status, so a batch reports which files are ready and
           *  which were rejected before anything is uploaded. */}
          {picked.length > 0 ? (
            <ul
              aria-live="polite"
              className="max-h-52 overflow-y-auto rounded-xl border border-border/60 bg-card/40"
            >
              {picked.map((p) => (
                <li
                  key={p.key}
                  className="flex items-center gap-2 border-b border-border/40 px-3 py-2 last:border-b-0"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-foreground">{p.file.name}</span>
                    <span
                      className={cn(
                        "block text-xs",
                        p.error ? "text-destructive" : "text-muted-foreground",
                      )}
                    >
                      {p.error ??
                        `${p.scene?.elements.length ?? 0} element${
                          p.scene?.elements.length === 1 ? "" : "s"
                        }`}
                    </span>
                  </span>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setPicked((prev) => prev.filter((x) => x.key !== p.key))}
                    aria-label={`Remove ${p.file.name}`}
                    className={cn(
                      "shrink-0 rounded p-1 text-muted-foreground transition-colors",
                      "hover:bg-accent hover:text-foreground",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
                      "disabled:opacity-50",
                    )}
                  >
                    <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} className="size-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          ) : null}

          {singleFile ? (
            <div className="flex flex-col gap-2">
              <Label htmlFor="import-excalidraw-name">Name</Label>
              <Input
                id="import-excalidraw-name"
                value={name}
                onChange={(e) => setName(e.currentTarget.value)}
                placeholder={defaultNameFrom(picked[0].file.name)}
                disabled={busy}
              />
            </div>
          ) : null}

          {/* Submit lives inside the form so Enter in the Name field
           *  imports, matching `<RenameDialog>`. Implicit submission is
           *  blocked while the button is disabled (nothing importable),
           *  and `onSubmit` re-checks — so Enter cannot fire a partial
           *  submit. */}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={requestClose} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy || importable.length === 0}>
              {busy
                ? progress
                  ? `Importing ${progress.done + 1} of ${progress.total}…`
                  : "Importing…"
                : importable.length > 1
                  ? `Import ${importable.length} files`
                  : "Import"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

type SceneRead =
  | { scene: ExcalidrawExport; error: null; identity: string }
  | { scene: null; error: string; identity: string };

/** Pre-flight one picked file. Mirrors the worker's acceptance rules
 *  (`normalizeImportedExcalidraw`) so a file that passes here is not
 *  rejected after the upload — including the `appState`/`files` shape
 *  guards, which is what keeps the two in step.
 *
 *  Also returns `identity`, the dedup key. It is the file NAME plus a
 *  digest of its BYTES rather than its size/mtime: two different files
 *  can share a name, a size and a timestamp, and silently dropping one
 *  of those would lose the user's data. Same name + same bytes is the
 *  same import; a differently-named copy and a same-named different
 *  drawing both survive. */
async function readScene(file: File): Promise<SceneRead> {
  // Used when the bytes are never read (oversized) or cannot be hashed.
  const fallbackId = `${file.name}::${file.size}:${file.lastModified}`;

  if (file.size > MAX_IMPORT_BYTES) {
    const mb = (n: number) => (n / 1024 / 1024).toFixed(1);
    return {
      scene: null,
      error: `Too large (${mb(file.size)} MB, limit ${mb(MAX_IMPORT_BYTES)} MB).`,
      identity: fallbackId,
    };
  }

  // One read feeding both the digest and the parse.
  const bytes = new Uint8Array(await file.arrayBuffer());
  const digest = await digestOf(bytes);
  const identity = digest ? `${file.name}::${digest}` : fallbackId;

  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return { scene: null, error: "Not valid JSON.", identity };
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return { scene: null, error: "No Excalidraw scene in this file.", identity };
  }
  const raw = parsed as Record<string, unknown>;
  // `type` is absent from Inkwell's own downloads, so only a *present*
  // and *conflicting* value is a rejection.
  if (raw.type !== undefined && raw.type !== "excalidraw") {
    return { scene: null, error: "No Excalidraw scene in this file.", identity };
  }
  if (!Array.isArray(raw.elements)) return { scene: null, error: "No elements array.", identity };
  // Same rule as `normalizeImportedExcalidraw`: a `null` element crashes
  // the editor, so refuse it before uploading rather than after.
  if (raw.elements.some((el) => typeof el !== "object" || el === null)) {
    return { scene: null, error: "Contains invalid elements.", identity };
  }
  // Mirrors the worker's `appState`/`files` guards. Both are `typeof x !==
  // "object"`, so an array passes on either side — only a non-object
  // (e.g. a string) is refused.
  if (raw.appState !== undefined && (typeof raw.appState !== "object" || raw.appState === null)) {
    return { scene: null, error: "Invalid appState.", identity };
  }
  if (raw.files !== undefined && (typeof raw.files !== "object" || raw.files === null)) {
    return { scene: null, error: "Invalid files.", identity };
  }

  return {
    scene: {
      elements: raw.elements as ExcalidrawElement[],
      appState: (raw.appState as Partial<AppState> | undefined) ?? {},
      files: (raw.files as BinaryFiles | undefined) ?? {},
    },
    error: null,
    identity,
  };
}

/** SHA-256 of the file bytes as hex, or `null` when `crypto.subtle` is
 *  unavailable (a non-secure context) — callers fall back to a metadata
 *  key there rather than failing the pick. */
async function digestOf(bytes: Uint8Array<ArrayBuffer>): Promise<string | null> {
  if (typeof crypto === "undefined" || !crypto.subtle) return null;
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Best-effort: the file row already exists, so a failure here only
 *  costs the card its preview. */
async function putThumbnail(scene: ExcalidrawExport, id: string): Promise<void> {
  try {
    const svg = await renderExcalidrawThumbSvg(
      scene.elements,
      scene.appState ?? {},
      scene.files ?? {},
    );
    await filesApi.putThumb(id, svg);
  } catch {
    // Leave the placeholder glyph in place.
  }
}

/** Narrows a picked file to one that carries a parsed scene. */
function hasScene(p: PickedFile): p is PickedFile & { scene: ExcalidrawExport } {
  return p.scene !== null;
}

/** "my drawing.excalidraw" → "my drawing". Falls back when the stem is
 *  empty (a file literally named `.excalidraw`). */
function defaultNameFrom(filename: string): string {
  const stem = filename.replace(/\.excalidraw$/i, "").trim();
  return stem || "Untitled drawing";
}
