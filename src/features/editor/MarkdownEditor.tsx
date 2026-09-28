import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import type { FileBlob, LoadedFile, MarkdownNotesFileBlob, NotesFileBlob } from "@/lib/api/client";
import { useTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";
import type { EditorHeaderBridge, RenderEditorHeader } from "./editorHeaderBridge";
import { LeaveConfirmDialog } from "./lifecycle/LeaveConfirmDialog";
import { useLeaveConfirm } from "./lifecycle/useLeaveConfirm";
import { useSaveLifecycle } from "./lifecycle/useSaveLifecycle";
import { useThumbPipeline } from "./lifecycle/useThumbPipeline";
import { MarkdownEditorChrome } from "./MarkdownEditorChrome";
import { CodeMirrorEditor } from "./markdown/CodeMirrorEditor";
import {
  fingerprintMarkdown,
  isCanonicalMarkdownBlob,
  notesBlobToMarkdown,
} from "./markdown/compat";
import { MarkdownPreview } from "./markdown/MarkdownPreview";
import { markdownToThumbSvg } from "./markdown/thumb";
import { loadNotesFont } from "./notes/fontLoader";
import { fontStack, useNotesPreferences, widthMaxClass } from "./notes/preferences";

type SaveFn = (version: number, blob: FileBlob) => Promise<{ version: number }>;
type ThumbFn = ((svg: string) => Promise<void>) | null;

export interface MarkdownEditorProps {
  loaded: LoadedFile;
  save: SaveFn;
  saveThumb: ThumbFn;
  onThumbSaved?: () => void;
  onReload?: (loaded: LoadedFile) => void;
  reload?: () => Promise<LoadedFile>;
  renderHeader?: RenderEditorHeader;
}

function initialSource(blob: NotesFileBlob): string | null {
  return isCanonicalMarkdownBlob(blob) ? blob.source : null;
}

export default function MarkdownEditor({
  loaded,
  save,
  saveThumb,
  onThumbSaved,
  onReload,
  reload,
  renderHeader,
}: MarkdownEditorProps) {
  const readOnly = loaded.permission !== "write";
  const blob = loaded.blob as NotesFileBlob;
  const canonical = initialSource(blob);
  const [source, setSource] = useState<string | null>(canonical);
  const [loadError, setLoadError] = useState<string | null>(null);
  const { resolved } = useTheme();
  const { width, font, layout } = useNotesPreferences();
  const selectedFont = fontStack(font);
  const initialFingerprint = fingerprintMarkdown(canonical ?? "");
  const latestRef = useRef({ source: canonical ?? "", fp: initialFingerprint });
  const thumb = useThumbPipeline({ saveThumb, onThumbSaved, readOnly });

  const lifecycle = useSaveLifecycle<FileBlob, LoadedFile>({
    initialVersion: loaded.meta.version,
    initialFingerprint,
    readOnly,
    transport: { save, reload },
    getLatest: () => {
      const latest = latestRef.current;
      return {
        fp: latest.fp,
        blob: {
          kind: "notes",
          format: "markdown-v1",
          source: latest.source,
        } satisfies MarkdownNotesFileBlob,
      };
    },
    onSaved: (saved) => {
      const persisted = saved.blob as MarkdownNotesFileBlob;
      thumb.request(saved.fp, async () => markdownToThumbSvg(persisted.source));
    },
    onReload,
  });

  const lifecycleRef = useRef(lifecycle);
  lifecycleRef.current = lifecycle;
  const thumbRef = useRef(thumb);
  thumbRef.current = thumb;
  const loadedVersionRef = useRef(loaded.meta.version);
  loadedVersionRef.current = loaded.meta.version;

  useEffect(() => {
    let cancelled = false;
    setLoadError(null);
    const currentBlob = loaded.blob as NotesFileBlob;
    void notesBlobToMarkdown(currentBlob)
      .then((markdown) => {
        if (cancelled) return;
        const fp = fingerprintMarkdown(markdown);
        latestRef.current = { source: markdown, fp };
        setSource(markdown);
        thumbRef.current.reset();
        lifecycleRef.current.reset(loadedVersionRef.current, fp);
      })
      .catch((reason: unknown) => {
        if (!cancelled) {
          setSource(null);
          setLoadError(
            reason instanceof Error ? reason.message : "Unable to open this Markdown file.",
          );
        }
      });
    return () => {
      cancelled = true;
    };
    // Version bumps after every save while the blob reference stays stable;
    // re-running then would overwrite unsaved CodeMirror state.
  }, [loaded.blob]);

  useEffect(() => {
    void loadNotesFont(font);
  }, [font]);

  const handleChange = useCallback(
    (next: string) => {
      const fp = fingerprintMarkdown(next);
      latestRef.current = { source: next, fp };
      setSource(next);
      lifecycle.notifyChange();
    },
    [lifecycle],
  );

  const leave = useLeaveConfirm({
    isDirty: lifecycle.isDirty,
    saveNow: lifecycle.saveNow,
    discardPendingLocalWork: lifecycle.discardPendingLocalWork,
  });
  const { saveNow, discardPendingLocalWork } = lifecycle;
  const { requestLeave } = leave;
  const bridge = useMemo<EditorHeaderBridge>(
    () => ({
      status: source === null ? "loading" : readOnly ? null : lifecycle.status,
      errorMessage: loadError ?? lifecycle.errorMessage,
      saveNow: readOnly || source === null ? null : () => void saveNow(),
      flush: saveNow,
      discard: discardPendingLocalWork,
      requestLeave,
      toolbar: <MarkdownEditorChrome />,
    }),
    [
      source,
      readOnly,
      loadError,
      lifecycle.status,
      lifecycle.errorMessage,
      saveNow,
      discardPendingLocalWork,
      requestLeave,
    ],
  );

  const previewSource = useDeferredValue(source ?? "");
  const showSource = layout !== "preview";
  const showPreview = layout !== "source";

  return (
    <div className="flex h-full w-full flex-col">
      {renderHeader?.(bridge)}
      {source === null ? (
        <div className="flex min-h-0 flex-1 items-center justify-center p-8 text-sm text-muted-foreground">
          {loadError ?? "Preparing Markdown…"}
        </div>
      ) : (
        <div
          className={cn(
            "markdown-editor-layout min-h-0 flex-1",
            layout === "split" && "markdown-layout-split",
          )}
        >
          {showSource && (
            <section className="markdown-source-pane min-h-0" aria-label="Markdown source">
              <div className={cn("mx-auto h-full w-full", widthMaxClass(width))}>
                <CodeMirrorEditor
                  value={source}
                  onChange={handleChange}
                  readOnly={readOnly}
                  dark={resolved === "dark"}
                  fontFamily={selectedFont}
                />
              </div>
            </section>
          )}
          {showPreview && (
            <section
              className="markdown-preview-pane min-h-0 overflow-y-auto"
              aria-label="Markdown preview"
            >
              <div
                className={cn("mx-auto w-full px-5 py-8 sm:px-8 lg:py-10", widthMaxClass(width))}
              >
                <MarkdownPreview
                  source={previewSource}
                  dark={resolved === "dark"}
                  fontFamily={selectedFont}
                />
              </div>
            </section>
          )}
        </div>
      )}
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
