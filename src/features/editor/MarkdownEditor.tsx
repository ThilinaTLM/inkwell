import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";
import {
  type FileBlob,
  files,
  type LoadedFile,
  type MarkdownNotesFileBlob,
  type NotesFileBlob,
} from "@/lib/api/client";
import { useTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";
import type { EditorExporter, EditorHeaderBridge, RenderEditorHeader } from "./editorHeaderBridge";
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
import { markdownToThumbSvg } from "./markdown/thumb";
import { loadNotesFont } from "./notes/fontLoader";
import {
  fontStack,
  NOTES_FONTS,
  type NotesEditorFont,
  useNotesPreferences,
  widthMaxClass,
} from "./notes/preferences";
import { downloadText, exportBaseName } from "./shared/exportFile";

const CrepeEditor = lazy(() => import("./markdown/CrepeEditor"));

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
  const { width, font, mode } = useNotesPreferences();
  const [epoch, setEpoch] = useState(0);
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
        setEpoch((n) => n + 1);
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
  const fileName = loaded.meta.name;
  const exporters = useMemo<EditorExporter[]>(() => {
    const base = exportBaseName(fileName);
    const current = () => latestRef.current.source;
    return [
      {
        id: "md",
        label: ".md",
        hint: "The Markdown source as plain text.",
        run: () => downloadText(current(), `${base}.md`, "text/markdown"),
      },
      {
        id: "html",
        label: "HTML",
        hint: "A standalone page with styles included (math loads KaTeX from a CDN).",
        run: async () => {
          const { markdownToHtmlDocument } = await import("./markdown/exportHtml");
          downloadText(
            await markdownToHtmlDocument(current(), fileName),
            `${base}.html`,
            "text/html",
          );
        },
      },
      {
        id: "pdf",
        label: "PDF",
        hint: "Opens the print dialog — choose “Save as PDF”.",
        run: async () => {
          const { printMarkdownAsPdf } = await import("./markdown/exportHtml");
          await printMarkdownAsPdf(current(), fileName);
        },
      },
    ];
  }, [fileName]);
  const bridge = useMemo<EditorHeaderBridge>(
    () => ({
      status: source === null ? "loading" : readOnly ? null : lifecycle.status,
      errorMessage: loadError ?? lifecycle.errorMessage,
      saveNow: readOnly || source === null ? null : saveNow,
      flush: saveNow,
      discard: discardPendingLocalWork,
      requestLeave,
      toolbar: <MarkdownEditorChrome />,
      exporters,
    }),
    [
      exporters,
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

  // ── Scroll continuity between Write and Source ──────────────────
  const scrollRef = useRef<HTMLDivElement>(null);
  const ratioRef = useRef(0);
  const restoringRef = useRef(false);
  const lastModeRef = useRef(mode);
  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el || restoringRef.current) return;
    const max = el.scrollHeight - el.clientHeight;
    ratioRef.current = max > 0 ? el.scrollTop / max : 0;
  }, []);
  const restoreScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    restoringRef.current = true;
    const apply = () => {
      const max = el.scrollHeight - el.clientHeight;
      el.scrollTop = max * ratioRef.current;
    };
    apply();
    requestAnimationFrame(() => {
      apply();
      window.setTimeout(() => {
        restoringRef.current = false;
      }, 120);
    });
  }, []);
  const pendingRestoreRef = useRef(false);
  useLayoutEffect(() => {
    if (lastModeRef.current === mode) return;
    lastModeRef.current = mode;
    pendingRestoreRef.current = true;
  }, [mode]);
  const consumeRestore = useCallback(() => {
    if (!pendingRestoreRef.current) return;
    pendingRestoreRef.current = false;
    restoreScroll();
  }, [restoreScroll]);

  const folderId = loaded.meta.folderId ?? null;
  const uploadImage = useCallback(
    async (file: File) => {
      try {
        const ext = file.type.split("/")[1]?.replace(/[^a-z0-9]/gi, "") || "png";
        const name =
          file.name && file.name !== "image.png" ? file.name : `image-${Date.now()}.${ext}`;
        const meta = await files.uploadRaw(file, { name, folderId });
        return files.rawUrl(meta.id);
      } catch (reason) {
        toast.error(reason instanceof Error ? reason.message : "Image upload failed");
        throw reason;
      }
    },
    [folderId],
  );

  const headingFamily = useMemo(() => {
    const option = NOTES_FONTS.find((f) => f.value === (font as NotesEditorFont));
    return option && option.family !== "Sans" ? option.stack : "var(--font-display)";
  }, [font]);
  const bodySize = NOTES_FONTS.find((f) => f.value === font)?.family === "Mono" ? "15px" : "17px";
  const surfaceStyle = {
    "--ink-md-body": selectedFont,
    "--ink-md-heading": headingFamily,
    "--ink-md-size": bodySize,
  } as React.CSSProperties;

  return (
    <div className="flex h-full w-full flex-col">
      {renderHeader?.(bridge)}
      {source === null ? (
        <div className="flex min-h-0 flex-1 items-center justify-center p-8 text-sm text-muted-foreground">
          {loadError ?? "Preparing Markdown…"}
        </div>
      ) : (
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="markdown-scroll min-h-0 flex-1 overflow-y-auto"
          style={surfaceStyle}
          data-mode={mode}
        >
          <div
            className={cn(
              "mx-auto w-full px-5 pt-8 sm:px-10 sm:pt-12 lg:pt-14",
              widthMaxClass(width),
            )}
          >
            {mode === "source" ? (
              <CodeMirrorEditor
                variant="writing"
                value={source}
                onChange={handleChange}
                readOnly={readOnly}
                dark={resolved === "dark"}
                fontFamily={fontStack("jetbrains-mono")}
                onView={(view) => {
                  if (view) consumeRestore();
                }}
              />
            ) : (
              <Suspense
                fallback={
                  <div className="py-10 text-sm text-muted-foreground">Loading editor…</div>
                }
              >
                <CrepeEditor
                  key={epoch}
                  initialValue={latestRef.current.source}
                  readOnly={readOnly}
                  onChange={handleChange}
                  onImageUpload={uploadImage}
                  onReady={consumeRestore}
                />
              </Suspense>
            )}
          </div>
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
