// StaticSiteEditor — viewer / editor for `kind === "static-site"`.
//
// A static-site file is a bundle of HTML/CSS/JS/image assets; the common
// case — a single self-contained `.html` artifact — behaves like a
// document. Two modes, switched from the editor header's toolbar slot:
//
//   Preview  the rendered entry page inside a framed, browser-style
//            canvas (reload, open in new tab, device-width presets),
//            served from the signed render-session URL
//            (`/sites/:id/:sig/<entry>`).
//   Files    one workspace: a file tree (plus an "Overview & uploads"
//            page with the bundle table and the drop zone) next to a
//            themed CodeMirror for the selected file. Edits across
//            several files are kept as a buffer and saved together
//            (Ctrl/⌘+S → one assets POST with `If-Match`; every save is
//            a new bundle version, no autosave).
//
// Share-token visitors never see this surface — they are redirected
// straight to the signed `/shared/...` URL by `SharedTokenLandingPage` /
// `SharedEditorPage`. (If one does land here, `writable=false` hides
// every mutation control.)
//
// Security: the preview iframe is sandboxed WITHOUT `allow-same-origin`
// (scripts run, but in an opaque origin with no access to Inkwell's
// cookies or DOM); the asset route additionally sets
// `frame-ancestors 'self'`. See `StaticSitePreviewRedirect.tsx`.
//
// Concurrency: every mutator is its own POST with `If-Match: <version>`;
// 409s surface as a toast.

import { ArrowDown01Icon, CodeIcon, ViewIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Surface } from "@/components/Surface";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Segmented } from "@/components/ui/segmented";
import {
  ApiError,
  type FileMeta,
  files,
  type LoadedFile,
  type StaticSiteFileBlob,
  type StaticSiteRenderSession,
  staticSites,
} from "@/lib/api/client";
import { keys } from "@/lib/api/query-keys";
import { errorMessage } from "@/lib/errors";
import { useTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";
import type { EditorExporter, EditorHeaderBridge, RenderEditorHeader } from "./editorHeaderBridge";
import { LeaveConfirmDialog } from "./lifecycle/LeaveConfirmDialog";
import type { EditorSaveStatus } from "./lifecycle/types";
import { useLeaveConfirm } from "./lifecycle/useLeaveConfirm";
import { downloadBlob, exportBaseName } from "./shared/exportFile";
import { type BufferState, CodePane } from "./static-site/CodePane";
import { FilesList } from "./static-site/FilesList";
import { FileTree } from "./static-site/FileTree";
import { PreviewFrame } from "./static-site/PreviewFrame";
import { SiteCard } from "./static-site/SiteCard";
import {
  baseName,
  encodePath,
  isHtmlPath,
  isImageAsset,
  isTextAsset,
  MAX_EDITABLE_BYTES,
  TEMPLATE_HTML,
} from "./static-site/sitePaths";
import { UploadPanel } from "./static-site/UploadPanel";

export interface StaticSiteEditorProps {
  loaded: LoadedFile;
  /** Renders the page header above the viewer (see `EditorHeader`). */
  renderHeader?: RenderEditorHeader;
  /** Override the render-session minter — defaults to owner's.
   *  Share-token viewers pass `() => shares.renderSession(token)`. */
  mintSession?: () => Promise<StaticSiteRenderSession>;
  /** When false, hides every mutation control (uploads, delete, entry,
   *  code editing). Used by the read-only share-token view. */
  writable?: boolean;
  /** Optional callback fired after a successful mutation so the
   *  parent can patch its own LoadedFile. */
  onManifestChanged?: (manifest: StaticSiteFileBlob, meta: FileMeta) => void;
}

type Mode = "preview" | "files";
type MutResult = Awaited<ReturnType<typeof staticSites.uploadAssets>>;

const MIME: Record<string, string> = {
  html: "text/html",
  htm: "text/html",
  css: "text/css",
  js: "text/javascript",
  mjs: "text/javascript",
  json: "application/json",
  svg: "image/svg+xml",
  xml: "application/xml",
};
function mimeFor(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  return MIME[ext] ?? "text/plain";
}

export default function StaticSiteEditor({
  loaded,
  renderHeader,
  mintSession,
  writable = true,
  onManifestChanged,
}: StaticSiteEditorProps) {
  const id = loaded.meta.id;
  const qc = useQueryClient();
  const { resolved: theme } = useTheme();

  // Manifest: seed from `loaded.blob` so the first paint is instant,
  // then keep in sync via `useQuery`. Mutations write into the cache.
  const initialManifest = useMemo(() => coerceManifest(loaded.blob), [loaded.blob]);
  const manifestQuery = useQuery({
    queryKey: keys.files.manifest(id),
    queryFn: () => staticSites.manifest(id),
    initialData: initialManifest,
    staleTime: 30_000,
  });
  const manifest = manifestQuery.data ?? initialManifest;
  const isEmpty = manifest.assets.length === 0;

  const [mode, setMode] = useState<Mode>(isEmpty ? "files" : "preview");
  // Selected file in the Files workspace; `null` = Overview & uploads.
  const [selected, setSelected] = useState<string | null>(isEmpty ? null : manifest.entry);
  const [treeOpen, setTreeOpen] = useState(false);
  const [previewNonce, setPreviewNonce] = useState(0);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  // Local version mirror — bumped on every successful mutation. The
  // server's `If-Match` precondition keeps two concurrent tabs honest.
  const [version, setVersion] = useState(loaded.meta.version);
  useEffect(() => {
    setVersion(loaded.meta.version);
  }, [loaded.meta.version]);

  // ── Render session (signed URL prefix) ───────────────────────────
  const sessionQuery = useQuery({
    queryKey: ["static-site", "render-session", id],
    queryFn: mintSession ?? (() => staticSites.renderSession(id)),
    enabled: !isEmpty,
    // Signatures live ~30 minutes; re-mint well before that.
    staleTime: 15 * 60_000,
    gcTime: 15 * 60_000,
  });
  const prefix = sessionQuery.data?.prefix ?? null;
  const entryUrl = prefix ? prefix + encodePath(manifest.entry) : null;
  const fileUrl = useMemo(
    () => (prefix ? (path: string) => prefix + encodePath(path) : null),
    [prefix],
  );

  // ── File buffers ─────────────────────────────────────────────────
  // `texts` = last known server content per path; `edits` = unsaved
  // local text (only paths that differ from `texts`).
  const [texts, setTexts] = useState<Record<string, string>>({});
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [loadErrors, setLoadErrors] = useState<Record<string, string>>({});
  const [epoch, setEpoch] = useState(0);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const editsRef = useRef(edits);
  editsRef.current = edits;
  const textsRef = useRef(texts);
  textsRef.current = texts;
  const dirtyPaths = useMemo(() => new Set(Object.keys(edits)), [edits]);
  const dirty = dirtyPaths.size > 0;
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;

  const selectedAsset = selected
    ? (manifest.assets.find((a) => a.path === selected) ?? null)
    : null;
  // Selected file vanished (deleted elsewhere / replaced by a zip).
  useEffect(() => {
    if (selected && !selectedAsset && manifest.assets.length > 0) setSelected(manifest.entry);
    if (mode === "preview" && isEmpty) setMode("files");
  }, [selected, selectedAsset, manifest.assets.length, manifest.entry, mode, isEmpty]);

  // Load the selected text file the first time it is opened.
  const failedRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (mode !== "files" || !selectedAsset || !fileUrl) return;
    const path = selectedAsset.path;
    if (
      texts[path] !== undefined ||
      failedRef.current.has(`${epoch}:${path}`) ||
      !isTextAsset(selectedAsset) ||
      selectedAsset.size > MAX_EDITABLE_BYTES
    ) {
      return;
    }
    let cancelled = false;
    void fetch(`${fileUrl(path)}?v=${version}-${epoch}`, { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.text();
      })
      .then((text) => {
        if (!cancelled) setTexts((t) => ({ ...t, [path]: text }));
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        failedRef.current.add(`${epoch}:${path}`);
        setLoadErrors((m) => ({ ...m, [path]: errorMessage(e, "could not load the file") }));
      });
    return () => {
      cancelled = true;
    };
  }, [mode, selectedAsset, fileUrl, texts, version, epoch]);

  const onEdit = useCallback((path: string, text: string) => {
    setEdits((prev) => {
      const base = textsRef.current[path];
      if (text === base) {
        if (!(path in prev)) return prev;
        const { [path]: _drop, ...rest } = prev;
        return rest;
      }
      return { ...prev, [path]: text };
    });
  }, []);

  // ── Mutation helpers ─────────────────────────────────────────────
  const onMutated = useCallback(
    (result: MutResult, own = false) => {
      setVersion(result.meta.version);
      setPreviewNonce((n) => n + 1);
      if (!own) {
        // Content may have changed under us: drop cached baselines.
        setTexts({});
        setLoadErrors({});
        setEpoch((n) => n + 1);
      }
      // Forget edits for files that no longer exist.
      const live = new Set(result.manifest.assets.map((a) => a.path));
      setEdits((prev) => {
        const keep = Object.entries(prev).filter(([p]) => live.has(p));
        return keep.length === Object.keys(prev).length ? prev : Object.fromEntries(keep);
      });
      qc.setQueryData(keys.files.manifest(id), result.manifest);
      qc.invalidateQueries({ queryKey: ["files", "list"] });
      qc.invalidateQueries({ queryKey: ["folders", "list"] });
      onManifestChanged?.(result.manifest, result.meta);
    },
    [id, onManifestChanged, qc],
  );

  const uploadFilesMutation = useMutation({
    mutationFn: (entries: Array<File | { path: string; file: File }>) =>
      staticSites.uploadAssets(id, entries, version),
    onSuccess: (r) => onMutated(r),
    onError: (e) => toast.error(errorMessage(e, "upload failed")),
  });
  const uploadZipMutation = useMutation({
    mutationFn: (zip: Blob) => staticSites.uploadZip(id, zip, version),
    onSuccess: (r) => onMutated(r),
    onError: (e) => toast.error(errorMessage(e, "upload failed")),
  });
  const deleteAssetMutation = useMutation({
    mutationFn: (path: string) => staticSites.deleteAsset(id, path, version),
    onSuccess: (r) => onMutated(r),
    onError: (e) => toast.error(errorMessage(e, "delete failed")),
  });
  const setEntryMutation = useMutation({
    mutationFn: (path: string) => staticSites.setEntry(id, path, version),
    onSuccess: (r) => onMutated(r),
    onError: (e) => toast.error(errorMessage(e, "set entry failed")),
  });

  const uploadFiles = useCallback(
    (entries: Array<File | { path: string; file: File }>) => {
      const wasEmpty = isEmpty;
      uploadFilesMutation.mutate(entries, {
        onSuccess: (r) => {
          toast.success(entries.length === 1 ? "File added" : `${entries.length} files added`);
          if (wasEmpty) {
            setSelected(null);
            setMode("preview");
          } else if (r.manifest.assets.length === 0) {
            setMode("files");
          }
        },
      });
    },
    [isEmpty, uploadFilesMutation],
  );
  const uploadZip = useCallback(
    (zip: Blob) => {
      uploadZipMutation.mutate(zip, {
        onSuccess: (r) => {
          toast.success("Site replaced");
          setSelected(r.manifest.entry);
          setMode("preview");
        },
      });
    },
    [uploadZipMutation],
  );
  const useTemplate = useCallback(() => {
    uploadFilesMutation.mutate(
      [
        {
          path: "index.html",
          file: new File([TEMPLATE_HTML], "index.html", { type: "text/html" }),
        },
      ],
      {
        onSuccess: () => {
          setSelected("index.html");
          setMode("files");
        },
      },
    );
  }, [uploadFilesMutation]);

  const pending = uploadZipMutation.isPending
    ? { kind: "zip" as const, label: "Replacing the site…" }
    : uploadFilesMutation.isPending
      ? {
          kind: "files" as const,
          label: `Uploading ${uploadFilesMutation.variables?.length ?? ""} ${
            uploadFilesMutation.variables?.length === 1 ? "file" : "files"
          }…`,
        }
      : null;
  const mutating = setEntryMutation.isPending || deleteAssetMutation.isPending;

  // ── Save every edited file (Ctrl/⌘+S) ────────────────────────────
  const versionRef = useRef(version);
  versionRef.current = version;

  const saveSource = useCallback(async (): Promise<boolean> => {
    if (!writable) return true;
    const pendingEdits = editsRef.current;
    const paths = Object.keys(pendingEdits);
    if (paths.length === 0) return true;
    setSaving(true);
    setSaveError(null);
    try {
      const result = await staticSites.uploadAssets(
        id,
        paths.map((path) => ({
          path,
          file: new File([pendingEdits[path]], baseName(path), { type: mimeFor(path) }),
        })),
        versionRef.current,
      );
      setTexts((t) => ({ ...t, ...pendingEdits }));
      // Keep anything typed while the request was in flight.
      setEdits((cur) => {
        const next: Record<string, string> = {};
        for (const [p, v] of Object.entries(cur)) if (pendingEdits[p] !== v) next[p] = v;
        return next;
      });
      onMutated(result, true);
      return true;
    } catch (e) {
      const msg =
        e instanceof ApiError && e.status === 409
          ? "Conflict: this site was changed elsewhere. Reload the page to get the latest version."
          : errorMessage(e, "save failed");
      setSaveError(msg);
      toast.error(msg);
      return false;
    } finally {
      setSaving(false);
    }
  }, [id, onMutated, writable]);

  const discardSource = useCallback(() => {
    setEdits({});
    setSaveError(null);
    setEpoch((n) => n + 1);
  }, []);

  const leave = useLeaveConfirm({
    isDirty: dirty || saving,
    saveNow: saveSource,
    discardPendingLocalWork: discardSource,
  });

  // Native prompt when closing the tab with unsaved code.
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  // ── Open preview in a new tab ────────────────────────────────────
  const openPreviewMutation = useMutation({
    mutationFn: mintSession ?? (() => staticSites.renderSession(id)),
  });
  const onOpenPreview = useCallback(() => {
    if (isEmpty) return;
    // With a live session we can open synchronously (popup-blocker safe).
    if (entryUrl) {
      window.open(entryUrl, "_blank", "noopener,noreferrer");
      return;
    }
    // Otherwise open a blank tab inside the click and redirect once the
    // mint resolves; sever `opener` right after.
    const win = window.open("about:blank", "_blank");
    if (!win) {
      toast.error("Could not open a new tab (popup blocked?)");
      return;
    }
    openPreviewMutation.mutate(undefined, {
      onSuccess: (session) => {
        win.location.href = session.prefix + encodePath(manifest.entry);
        try {
          win.opener = null;
        } catch {
          // Cross-origin reads on `win.opener` can throw once the
          // navigation begins — nothing to do.
        }
      },
      onError: (e) => {
        win.close();
        toast.error(errorMessage(e, "preview unavailable"));
      },
    });
  }, [isEmpty, entryUrl, manifest.entry, openPreviewMutation]);

  const refreshPreview = useCallback(() => {
    setPreviewNonce((n) => n + 1);
    void sessionQuery.refetch();
  }, [sessionQuery]);

  // ── Header bridge ────────────────────────────────────────────────
  const exporters = useMemo<EditorExporter[]>(() => {
    const base = exportBaseName(loaded.meta.name);
    const list: EditorExporter[] = [
      {
        id: "zip",
        label: ".zip",
        hint: "The whole bundle, ready to host anywhere.",
        run: () => {
          const a = document.createElement("a");
          a.href = files.downloadUrl(id);
          a.download = `${base}.zip`;
          document.body.appendChild(a);
          a.click();
          a.remove();
        },
      },
    ];
    if (isHtmlPath(manifest.entry) && entryUrl) {
      list.unshift({
        id: "html",
        label: "HTML",
        hint: `The entry page (${manifest.entry}) on its own.`,
        run: async () => {
          const r = await fetch(entryUrl, { cache: "no-store" });
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          downloadBlob(await r.blob(), `${base}.html`);
        },
      });
    }
    return list;
  }, [id, loaded.meta.name, manifest.entry, entryUrl]);

  const status: EditorSaveStatus | null = !writable
    ? null
    : saving
      ? "saving"
      : saveError
        ? "error"
        : dirty
          ? "dirty"
          : "saved";

  const toolbar = useMemo(
    () => (
      <Segmented<Mode>
        ariaLabel="Site view"
        value={mode}
        onChange={setMode}
        options={[
          {
            value: "preview",
            disabled: isEmpty,
            title: "Preview the site",
            label: (
              <span className="inline-flex items-center gap-1.5" data-testid="site-mode-preview">
                <HugeiconsIcon icon={ViewIcon} strokeWidth={1.8} className="size-3.5" />
                <span className="sr-only sm:not-sr-only">Preview</span>
              </span>
            ),
          },
          {
            value: "files",
            title: "Files and code",
            label: (
              <span className="inline-flex items-center gap-1.5" data-testid="site-mode-files">
                <HugeiconsIcon icon={CodeIcon} strokeWidth={1.8} className="size-3.5" />
                <span className="sr-only sm:not-sr-only">Files</span>
                {dirty ? (
                  <span
                    role="img"
                    aria-label="Unsaved changes"
                    className="size-1.5 rounded-full bg-primary"
                  />
                ) : null}
              </span>
            ),
          },
        ]}
      />
    ),
    [mode, isEmpty, dirty],
  );

  const { requestLeave } = leave;
  const bridge = useMemo<EditorHeaderBridge>(
    () => ({
      status,
      errorMessage: saveError,
      saveNow: writable ? saveSource : null,
      flush: saveSource,
      discard: discardSource,
      requestLeave,
      exporters,
      toolbar,
    }),
    [status, saveError, writable, saveSource, discardSource, requestLeave, exporters, toolbar],
  );

  // ── Selected-file buffer ─────────────────────────────────────────
  let buffer: BufferState = { status: "loading" };
  if (selectedAsset) {
    const p = selectedAsset.path;
    if (selectedAsset.size > MAX_EDITABLE_BYTES && isTextAsset(selectedAsset)) {
      buffer = { status: "unsupported", reason: "This file is too large to edit here." };
    } else if (!isTextAsset(selectedAsset)) {
      buffer = {
        status: "unsupported",
        reason: isImageAsset(selectedAsset)
          ? ""
          : "Binary file — nothing to edit. Use the actions in Overview to download it.",
      };
    } else if (edits[p] !== undefined) {
      buffer = { status: "ready", text: edits[p] };
    } else if (texts[p] !== undefined) {
      buffer = { status: "ready", text: texts[p] };
    } else if (loadErrors[p]) {
      buffer = { status: "error", message: loadErrors[p] };
    }
  }

  const selectFile = (p: string) => {
    setSelected(p);
    setTreeOpen(false);
  };
  const showOverview = () => {
    setSelected(null);
    setTreeOpen(false);
  };
  const deleteFile = (p: string) => {
    deleteAssetMutation.mutate(p, {
      onSuccess: () => {
        if (selected === p) setSelected(manifest.entry);
      },
    });
  };

  // ── Render ────────────────────────────────────────────────────────
  return (
    <Surface variant="page" className="flex h-dvh flex-col">
      {renderHeader?.(bridge)}

      <main className="min-h-0 flex-1 overflow-hidden">
        {mode === "preview" && !isEmpty ? (
          <PreviewFrame
            url={entryUrl}
            entry={manifest.entry}
            nonce={previewNonce}
            version={version}
            error={
              sessionQuery.isError ? errorMessage(sessionQuery.error, "preview unavailable") : null
            }
            title={loaded.meta.name}
            onRefresh={refreshPreview}
            onOpen={onOpenPreview}
            openPending={openPreviewMutation.isPending}
            unsaved={dirty && writable}
            onSave={() => void saveSource()}
          />
        ) : (
          <div className="flex h-full min-h-0 flex-col md:flex-row" data-testid="site-files-pane">
            {!isEmpty ? (
              <>
                {/* Mobile: collapsible picker; desktop: fixed sidebar */}
                <div className="shrink-0 border-b border-border/60 md:hidden">
                  <button
                    type="button"
                    onClick={() => setTreeOpen((o) => !o)}
                    aria-expanded={treeOpen}
                    className="flex h-10 w-full items-center gap-2 px-4 text-left text-sm"
                  >
                    <span className="min-w-0 flex-1 truncate font-mono text-[13px]">
                      {selected ?? "Overview & uploads"}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {manifest.assets.length} files
                    </span>
                    <HugeiconsIcon
                      icon={ArrowDown01Icon}
                      strokeWidth={2}
                      className={cn("size-4 transition-transform", treeOpen && "rotate-180")}
                    />
                  </button>
                  {treeOpen ? (
                    <FileTree
                      className="max-h-[45dvh] border-t border-border/60 bg-card/50"
                      assets={manifest.assets}
                      entry={manifest.entry}
                      selected={selected}
                      dirty={dirtyPaths}
                      onSelect={selectFile}
                      onOverview={showOverview}
                    />
                  ) : null}
                </div>
                <FileTree
                  className="hidden w-64 shrink-0 border-r border-border/60 bg-card/40 md:flex"
                  assets={manifest.assets}
                  entry={manifest.entry}
                  selected={selected}
                  dirty={dirtyPaths}
                  onSelect={selectFile}
                  onOverview={showOverview}
                />
              </>
            ) : null}

            <div className="min-h-0 min-w-0 flex-1">
              {selectedAsset ? (
                <CodePane
                  asset={selectedAsset}
                  isEntry={selectedAsset.path === manifest.entry}
                  writable={writable}
                  dark={theme === "dark"}
                  buffer={buffer}
                  editorKey={`${selectedAsset.path}:${epoch}`}
                  imageUrl={fileUrl ? fileUrl(selectedAsset.path) : null}
                  busy={mutating}
                  onChange={(t) => onEdit(selectedAsset.path, t)}
                  onRefreshPreview={() => {
                    if (dirtyRef.current) void saveSource().then(() => setMode("preview"));
                    else setMode("preview");
                  }}
                  onSetEntry={() => setEntryMutation.mutate(selectedAsset.path)}
                  onDelete={() => setConfirmDelete(selectedAsset.path)}
                />
              ) : (
                <div className="h-full overflow-y-auto">
                  <div className="mx-auto flex w-full max-w-4xl flex-col gap-5 px-4 py-6 sm:px-6">
                    {isEmpty ? null : (
                      <SiteCard
                        manifest={manifest}
                        writable={writable}
                        busy={mutating}
                        onOpen={onOpenPreview}
                        openPending={openPreviewMutation.isPending}
                        onSetEntry={(p) => setEntryMutation.mutate(p)}
                      />
                    )}
                    {writable ? (
                      <UploadPanel
                        isEmpty={isEmpty}
                        pending={pending}
                        onUploadFiles={uploadFiles}
                        onUploadZip={uploadZip}
                        onUseTemplate={useTemplate}
                      />
                    ) : isEmpty ? (
                      <p className="py-16 text-center text-sm text-muted-foreground">
                        This site has no files yet.
                      </p>
                    ) : null}
                    {isEmpty ? null : (
                      <FilesList
                        manifest={manifest}
                        writable={writable}
                        busy={mutating}
                        fileUrl={fileUrl}
                        onOpen={selectFile}
                        onSetEntry={(p) => setEntryMutation.mutate(p)}
                        onDelete={deleteFile}
                      />
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      <AlertDialog open={confirmDelete !== null} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this file?</AlertDialogTitle>
            <AlertDialogDescription>
              <code className="font-mono text-foreground">{confirmDelete}</code> will be removed
              from the site. Pages that link to it may break.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (confirmDelete) deleteFile(confirmDelete);
                setConfirmDelete(null);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <LeaveConfirmDialog
        open={leave.open}
        busy={leave.busy}
        onOpenChange={leave.onOpenChange}
        onDiscard={leave.discard}
        onSaveAndLeave={() => void leave.saveAndLeave().then(() => undefined)}
      />
    </Surface>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────

/** Coerce whatever `loaded.blob` was into a manifest. New static-site
 *  files always carry a real `StaticSiteFileBlob`; degenerate cases
 *  (manual API calls, future migrations) fall back to an empty
 *  manifest so the UI doesn't crash on load. */
function coerceManifest(blob: unknown): StaticSiteFileBlob {
  if (blob && typeof blob === "object") {
    const o = blob as { kind?: unknown; entry?: unknown; assets?: unknown };
    if (o.kind === "static-site" && typeof o.entry === "string" && Array.isArray(o.assets)) {
      return blob as StaticSiteFileBlob;
    }
  }
  return { kind: "static-site", entry: "index.html", assets: [] };
}
