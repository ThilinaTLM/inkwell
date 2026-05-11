// NotesEditor — BlockNote-backed rich text editor.
//
// Uses the same lifecycle scaffolding as Excalidraw / drawio:
//   • `useSaveLifecycle<NotesFileBlob, LoadedFile>` for the
//     30s-debounced autosave loop, 409-reload, and dirty bookkeeping.
//   • `useThumbPipeline` to dedup and ship a synthesised "page card"
//     SVG (see ./notes/thumb.ts) to R2 on every successful save.
//   • `useLeaveConfirm` + `<LeaveConfirmDialog>` for the in-app
//     navigation guard when the document is dirty.
//
// BlockNote's React surface is small enough that we don't need to mirror
// Excalidraw's "context provider for chrome" indirection — the chrome
// strip lives outside `<BlockNoteView>` in the same component tree, so
// it can read save state via plain props.

import "@blocknote/core/fonts/inter.css";
import "@blocknote/shadcn/style.css";

import { useCreateBlockNote } from "@blocknote/react";
import { BlockNoteView } from "@blocknote/shadcn";
import { useCallback, useEffect, useMemo, useRef } from "react";
import type { FileBlob, LoadedFile, NotesFileBlob } from "@/lib/api/client";
import { useTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { LeaveConfirmDialog } from "./lifecycle/LeaveConfirmDialog";
import { useLeaveConfirm } from "./lifecycle/useLeaveConfirm";
import { useSaveLifecycle } from "./lifecycle/useSaveLifecycle";
import { useThumbPipeline } from "./lifecycle/useThumbPipeline";
import { NotesEditorChrome } from "./NotesEditorChrome";
import { loadNotesFont } from "./notes/fontLoader";
import { useNotesPreferences, widthMaxClass } from "./notes/preferences";
import { notesBlocksToThumbSvg } from "./notes/thumb";

type SaveFn = (version: number, blob: FileBlob) => Promise<{ version: number }>;
type ThumbFn = ((svg: string) => Promise<void>) | null;

export interface NotesEditorProps {
  loaded: LoadedFile;
  /** Persists the notes blob. Must throw `ApiError(409)` on version conflict. */
  save: SaveFn;
  /** Persists an SVG thumbnail. Pass `null` to disable thumbnails (read-only shares). */
  saveThumb: ThumbFn;
  /** Called after a thumbnail upload succeeds. */
  onThumbSaved?: () => void;
  /** Called after a 409-driven reload. */
  onReload?: (loaded: LoadedFile) => void;
  /** Re-fetch the canonical file (for the 409 recovery path). */
  reload?: () => Promise<LoadedFile>;
  /** Optional back affordance. `null` to hide. */
  back?: { onClick: () => void; label: string } | null;
  /** Owner-only: open the rename dialog. Omit on read-only share sessions. */
  onRequestRename?: () => void;
  /** Owner-only: open the tags dialog. */
  onTags?: () => void;
  /** Owner-only: open the share dialog. */
  onShare?: () => void;
  /** Trigger a `.notes.json` download (typically `files.downloadUrl(id)`). */
  onDownload: () => void;
  /** True when the share token allows downloading; ignored for owner sessions. */
  allowDownload?: boolean;
}

export default function NotesEditor({
  loaded,
  save,
  saveThumb,
  onThumbSaved,
  onReload,
  reload,
  back = null,
  onRequestRename,
  onTags,
  onShare,
  onDownload,
  allowDownload = true,
}: NotesEditorProps) {
  const readOnly = loaded.permission !== "write";
  const { resolved: themeResolved } = useTheme();
  const { width, font } = useNotesPreferences();

  // The blob may legitimately be the legacy excalidraw shape (this
  // editor only mounts when `kind === "notes"`, but we still narrow
  // defensively — the API surface is shared across kinds).
  const initialBlob = loaded.blob as Partial<NotesFileBlob>;
  const initialBlocks = useMemo<unknown[]>(
    () => (Array.isArray(initialBlob.blocks) ? initialBlob.blocks : []),
    [initialBlob.blocks],
  );
  const initialFingerprint = useMemo(() => fingerprintBlocks(initialBlocks), [initialBlocks]);

  // BlockNote owns the document; we mirror it into a ref on every
  // change so the lifecycle's `getLatest()` can read the latest snapshot
  // without triggering React re-renders. `useCreateBlockNote` returns a
  // stable editor instance for the component's lifetime.
  // We pass `initialContent` only when blocks is non-empty — BlockNote
  // requires a non-empty array, and an empty doc is the default anyway.
  const editor = useCreateBlockNote(
    initialBlocks.length > 0 ? { initialContent: initialBlocks as never } : {},
  );

  // Latest serialised snapshot — kept on a ref so the save loop reads
  // it without re-running on every keystroke.
  const latestRef = useRef<{ blocks: unknown[]; fp: string }>({
    blocks: initialBlocks,
    fp: initialFingerprint,
  });

  const thumb = useThumbPipeline({ saveThumb, onThumbSaved, readOnly });

  const lifecycle = useSaveLifecycle<FileBlob, LoadedFile>({
    initialVersion: loaded.meta.version,
    initialFingerprint,
    readOnly,
    transport: { save, reload },
    getLatest: () => {
      const snap = latestRef.current;
      return {
        fp: snap.fp,
        blob: { kind: "notes", blocks: snap.blocks } satisfies NotesFileBlob,
      };
    },
    onSaved: (saved) => {
      // Synthesise a thumb from the just-saved blocks. The pipeline's
      // own fingerprint dedup short-circuits a duplicate upload.
      const snap = latestRef.current;
      thumb.request(saved.fp, async () => notesBlocksToThumbSvg(snap.blocks));
    },
    onReload: (fresh) => {
      onReload?.(fresh);
    },
  });

  // Mirror onChange → ref + notify the lifecycle. BlockNote's onChange
  // fires synchronously after every internal mutation; the lifecycle's
  // own dedup against `savedFp` keeps no-op ticks (cursor moves, etc.)
  // off the wire.
  useEffect(() => {
    if (readOnly) return;
    const handle = editor.onChange(() => {
      const blocks = editor.document as unknown as unknown[];
      latestRef.current = { blocks, fp: fingerprintBlocks(blocks) };
      lifecycle.notifyChange();
    });
    return () => {
      // BlockNote's `onChange` returns a disposer in newer versions;
      // older versions returned void. Tolerate both.
      if (typeof handle === "function") handle();
    };
  }, [editor, readOnly, lifecycle]);

  // Reset when a *different* file is loaded (initial mount handled by
  // the construction above; this fires on navigation to another file
  // or on a 409-driven reload). Same key choice as ExcalidrawEditor:
  // we depend on `loaded.blob` reference, not `meta.version`, because
  // the parent bumps `meta.version` after every save while keeping
  // the blob ref stable.
  //
  // ⚠ The dependency list intentionally excludes `editor`, `thumb.reset`,
  // and `lifecycle.reset`. Earlier versions included them, which caused
  // theme switches (which re-render the parent) to trip the effect and
  // silently mark a dirty document as "saved" without actually saving —
  // a real data-loss footgun. The targets are stable for the file's
  // lifetime, so reading them via refs is safe.
  const editorRef = useRef(editor);
  editorRef.current = editor;
  const thumbRef = useRef(thumb);
  thumbRef.current = thumb;
  const lifecycleRef = useRef(lifecycle);
  lifecycleRef.current = lifecycle;
  useEffect(() => {
    const blob = loaded.blob as Partial<NotesFileBlob>;
    const blocks = Array.isArray(blob.blocks) ? blob.blocks : [];
    const fp = fingerprintBlocks(blocks);
    latestRef.current = { blocks, fp };
    if (blocks.length > 0) {
      try {
        editorRef.current.replaceBlocks(editorRef.current.document, blocks as never);
      } catch {
        // BlockNote rejects malformed blocks; in that case we leave
        // the editor empty — the autosave loop will overwrite the
        // bad blob on the next change.
      }
    }
    thumbRef.current.reset();
    lifecycleRef.current.reset(loaded.meta.version, fp);
  }, [loaded.blob, loaded.meta.version]);

  // ─── Font face loading + body-level CSS hook ──────────────────
  // The chosen typeface is applied to BlockNote via `--bn-font-family`
  // (see `[data-notes-font=…] .bn-root` rules in `src/index.css`). We
  // set the data attribute on <html> so the cascade reaches both the
  // in-tree editor and BlockNote's portal popovers (mounted to body).
  // The actual @font-face CSS is fetched lazily on first selection by
  // `loadNotesFont`; subsequent selections of the same family are
  // resolved from the loader's in-memory cache without re-importing.
  useEffect(() => {
    void loadNotesFont(font);
    const html = document.documentElement;
    const previous = html.getAttribute("data-notes-font");
    html.setAttribute("data-notes-font", font);
    return () => {
      // Restore the previous attribute when this editor unmounts so
      // BlockNote popovers on a re-mount don't briefly inherit a
      // stale font from a stripped-but-still-cached value.
      if (previous == null) html.removeAttribute("data-notes-font");
      else html.setAttribute("data-notes-font", previous);
    };
  }, [font]);

  // ─── Leave-confirm guard for the back button ──────────────────────
  const leave = useLeaveConfirm({
    isDirty: lifecycle.isDirty,
    saveNow: lifecycle.saveNow,
    discardPendingLocalWork: lifecycle.discardPendingLocalWork,
  });
  const requestBack = useCallback(() => {
    if (!back) return;
    leave.requestLeave(back.onClick);
  }, [back, leave]);
  const guardedBack = useMemo(
    () => (back ? { onClick: requestBack, label: back.label } : null),
    [back, requestBack],
  );

  const onExportMarkdown = useCallback(async () => {
    try {
      const md = await editor.blocksToMarkdownLossy(latestRef.current.blocks as never);
      // Strip path-unsafe characters; including the ASCII control range
      // \x00–\x1F is the explicit intent of this filter (mirrors
      // `safeFilename` in worker/lib/responses.ts).
      const baseName =
        // biome-ignore lint/suspicious/noControlCharactersInRegex: control range is intentional
        (loaded.meta.name || "notes").replace(/[\\/:*?"<>|\x00-\x1F]/g, "_").trim() || "notes";
      const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${baseName}.md`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      // Revoke after a tick so Safari has time to start the download.
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      // Best-effort.
    }
  }, [editor, loaded.meta.name]);

  return (
    <div className="flex h-full w-full flex-col">
      <NotesEditorChrome
        name={loaded.meta.name}
        back={guardedBack}
        readOnly={readOnly}
        status={lifecycle.status}
        errorMessage={lifecycle.errorMessage}
        onSaveNow={!readOnly ? () => void lifecycle.saveNow() : null}
        onRequestRename={!readOnly && onRequestRename ? onRequestRename : null}
        onTags={!readOnly && onTags ? onTags : null}
        onShare={!readOnly && onShare ? onShare : null}
        onDownload={onDownload}
        onExportMarkdown={onExportMarkdown}
        allowDownload={allowDownload}
      />
      <div className="notes-scroll min-h-0 flex-1 overflow-y-auto overflow-x-hidden bg-background">
        {/* The padding + max-width wrapper lives **outside** BlockNoteView.
         *  BlockNote's shadcn build renders a second `.bn-root` portal node
         *  directly under <body> and copies the view's `className` onto
         *  it; passing padding utilities through `className` therefore
         *  leaks 80+ vertical pixels to a phantom element on body and
         *  forces the page into vertical+horizontal scroll. Wrapping is
         *  the cleanest way to keep our presentation off the portal.
         *
         *  `editable={false}` puts BlockNote in read-only / view mode for
         *  share-token recipients. Theme is controlled top-down so the
         *  editor matches the rest of the app. The selected typeface
         *  is applied via `--bn-font-family` (set on <html> by the
         *  effect below) so popovers rendered to the body portal
         *  inherit the same face. */}
        {/* `overflow-hidden` on the editor wrapper clips BlockNote's
         *  floating affordances (drag handles, side menu, in-tree
         *  formatting toolbar) when a block sits near the viewport
         *  edge. Without it, those elements briefly extend past the
         *  wrapper's box — wide enough to trigger a horizontal
         *  scrollbar on `.notes-scroll` even though that container
         *  already declares `overflow-x-hidden`. Clipping at the
         *  inner box stops the overflow at its source. */}
        <div
          className={cn(
            "mx-auto w-full overflow-hidden px-4 py-6 sm:px-8 sm:py-10",
            widthMaxClass(width),
          )}
        >
          <BlockNoteView editor={editor} editable={!readOnly} theme={themeResolved} />
        </div>
      </div>
      <LeaveConfirmDialog
        open={leave.open}
        busy={leave.busy}
        onOpenChange={leave.onOpenChange}
        onDiscard={leave.discard}
        onSaveAndLeave={() => void leave.saveAndLeave()}
      />
    </div>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────────

// Cheap O(n) fingerprint of the document — used to dedup autosaves so
// caret / selection ticks don't queue network I/O. We round-trip
// through `JSON.stringify` because BlockNote's block tree is opaque
// JSON to us (no per-element version field like Excalidraw's). For a
// typical note this is ≤100KB and the FNV-1a fold below is on the
// order of microseconds.
function fingerprintBlocks(blocks: unknown[]): string {
  let json: string;
  try {
    json = JSON.stringify(blocks);
  } catch {
    return `0|${blocks.length}`;
  }
  // FNV-1a 32-bit, same flavor as drawio's `hashXml` in DrawioEditor.
  let h = 0x811c9dc5;
  for (let i = 0; i < json.length; i++) {
    h ^= json.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return `${h.toString(16)}|${json.length}`;
}
