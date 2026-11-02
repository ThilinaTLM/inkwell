// StaticSiteEditor — viewer / editor for `kind === "static-site"`.
//
// A static-site file is a bundle of HTML/CSS/JS/image assets; for the
// common case — a single self-contained `.html` artifact — it behaves
// like a document. Three tabs:
//
//   Preview  the rendered entry page in a sandboxed iframe, served from
//            the signed render-session URL (`/sites/:id/:sig/<entry>`),
//            with refresh and open-in-new-tab.
//   Code     CodeMirror HTML editing of the entry file. Ctrl/⌘+S uploads
//            it through the assets endpoint with `If-Match`; no autosave
//            (every save is a new bundle version).
//   Files    the bundle manager: file list, set entry, delete, upload,
//            replace via ZIP. Only prominent (count badge) for
//            multi-file bundles.
//
// Share-token visitors never see this surface — they are redirected
// straight to the signed `/shared/...` URL by `SharedTokenLandingPage` /
// `SharedEditorPage`.
//
// Security: the preview iframe is sandboxed WITHOUT `allow-same-origin`
// (scripts run, but in an opaque origin with no access to Inkwell's
// cookies or DOM); the asset route additionally sets
// `frame-ancestors 'self'`. See `StaticSitePreviewRedirect.tsx` for the
// signed-URL contract.
//
// Concurrency: every mutator (upload, delete, set-entry, ZIP-upload,
// code save) is its own POST with `If-Match: <version>`; 409s surface as
// a toast + manifest refetch.

import { Alert02Icon, CodeIcon, LinkSquare01Icon, RefreshIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Surface } from "@/components/Surface";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { CodeMirrorEditor } from "./markdown/CodeMirrorEditor";
import { downloadBlob, exportBaseName } from "./shared/exportFile";
import { FilesList } from "./static-site/FilesList";
import { SiteCard } from "./static-site/SiteCard";
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

type Tab = "preview" | "code" | "files";

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
  // then keep in sync via `useQuery`. Subsequent mutations write
  // directly into the cache via `setQueryData`.
  const initialManifest = useMemo(() => coerceManifest(loaded.blob), [loaded.blob]);
  const manifestQuery = useQuery({
    queryKey: keys.files.manifest(id),
    queryFn: () => staticSites.manifest(id),
    initialData: initialManifest,
    staleTime: 30_000,
  });
  const manifest = manifestQuery.data ?? initialManifest;
  const isEmpty = manifest.assets.length === 0;
  const multiFile = manifest.assets.length > 1;

  const [tab, setTab] = useState<Tab>(isEmpty ? "files" : "preview");
  const [previewNonce, setPreviewNonce] = useState(0);

  // Local version mirror — bumped on every successful mutation. The
  // server's `If-Match` precondition keeps two concurrent tabs honest.
  const [version, setVersion] = useState(loaded.meta.version);
  useEffect(() => {
    setVersion(loaded.meta.version);
  }, [loaded.meta.version]);
  // Version produced by our own code save; any other bump (Files tab,
  // another tab) means the entry file may have changed under the editor.
  const ownVersionRef = useRef(loaded.meta.version);

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

  // ── Code buffer ──────────────────────────────────────────────────
  const [source, setSource] = useState<string | null>(null);
  const [baseline, setBaseline] = useState<string | null>(null);
  const [sourceError, setSourceError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const dirty = source !== null && baseline !== null && source !== baseline;
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;

  // Load the entry source the first time the Code tab opens (and again
  // after the bundle changed elsewhere while the buffer is clean).
  useEffect(() => {
    if (tab !== "code" || source !== null || !entryUrl) return;
    let cancelled = false;
    setSourceError(null);
    void fetch(entryUrl, { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.text();
      })
      .then((text) => {
        if (cancelled) return;
        setSource(text);
        setBaseline(text);
      })
      .catch((e: unknown) => {
        if (!cancelled) setSourceError(errorMessage(e, "could not load the file"));
      });
    return () => {
      cancelled = true;
    };
  }, [tab, source, entryUrl]);

  useEffect(() => {
    if (version === ownVersionRef.current) return;
    ownVersionRef.current = version;
    if (!dirtyRef.current) {
      setSource(null);
      setBaseline(null);
    }
  }, [version]);

  // Entry changed (Files tab → set entry): reload the buffer if clean.
  const entryRef = useRef(manifest.entry);
  useEffect(() => {
    if (entryRef.current === manifest.entry) return;
    entryRef.current = manifest.entry;
    if (!dirtyRef.current) {
      setSource(null);
      setBaseline(null);
    }
  }, [manifest.entry]);

  // ── Mutation helpers ─────────────────────────────────────────────
  type MutResult = Awaited<ReturnType<typeof staticSites.uploadAssets>>;
  const onMutated = useCallback(
    (result: MutResult) => {
      setVersion(result.meta.version);
      setPreviewNonce((n) => n + 1);
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
    onSuccess: onMutated,
    onError: (e) => toast.error(errorMessage(e, "upload failed")),
  });
  const uploadZipMutation = useMutation({
    mutationFn: (zip: Blob) => staticSites.uploadZip(id, zip, version),
    onSuccess: onMutated,
    onError: (e) => toast.error(errorMessage(e, "upload failed")),
  });
  const deleteAssetMutation = useMutation({
    mutationFn: (path: string) => staticSites.deleteAsset(id, path, version),
    onSuccess: onMutated,
    onError: (e) => toast.error(errorMessage(e, "delete failed")),
  });
  const setEntryMutation = useMutation({
    mutationFn: (path: string) => staticSites.setEntry(id, path, version),
    onSuccess: onMutated,
    onError: (e) => toast.error(errorMessage(e, "set entry failed")),
  });

  // ── Save the entry file (Ctrl/⌘+S, Code tab) ─────────────────────
  const versionRef = useRef(version);
  versionRef.current = version;
  const sourceRef = useRef(source);
  sourceRef.current = source;
  const baselineRef = useRef(baseline);
  baselineRef.current = baseline;
  const entryPathRef = useRef(manifest.entry);
  entryPathRef.current = manifest.entry;

  const saveSource = useCallback(async (): Promise<boolean> => {
    const text = sourceRef.current;
    if (!writable) return true;
    if (text === null || text === baselineRef.current) return true;
    setSaving(true);
    setSaveError(null);
    try {
      const path = entryPathRef.current;
      const name = path.split("/").pop() || "index.html";
      const result = await staticSites.uploadAssets(
        id,
        [{ path, file: new File([text], name, { type: "text/html" }) }],
        versionRef.current,
      );
      ownVersionRef.current = result.meta.version;
      setBaseline(text);
      onMutated(result);
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
    setSource(baselineRef.current);
    setSaveError(null);
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
    // mint resolves. No `noopener` here: we need the handle; the new
    // tab loads with a sandbox CSP anyway and we sever `opener` below.
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
    if (/\.html?$/i.test(manifest.entry) && entryUrl) {
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
    }),
    [status, saveError, writable, saveSource, discardSource, requestLeave, exporters],
  );

  const totalBytes = useMemo(() => totalSize(manifest), [manifest]);
  const totalLabel = `${manifest.assets.length} · ${formatBytes(totalBytes)}`;
  const canEditCode = writable && !isEmpty;

  // ── Render ────────────────────────────────────────────────────────
  return (
    <Surface variant="page" className="flex h-dvh flex-col">
      {renderHeader?.(bridge)}

      <div className="flex shrink-0 items-center gap-2 border-b border-border/50 px-3 sm:px-4">
        <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)} className="min-w-0">
          <TabsList variant="line" aria-label="Site views" className="h-10 gap-3">
            <TabsTrigger value="preview" className="flex-none px-1" disabled={isEmpty}>
              Preview
            </TabsTrigger>
            {canEditCode ? (
              <TabsTrigger value="code" className="flex-none px-1" data-testid="site-tab-code">
                Code
                {dirty ? <span aria-hidden className="size-1.5 rounded-full bg-primary" /> : null}
              </TabsTrigger>
            ) : null}
            <TabsTrigger value="files" className="flex-none px-1" data-testid="site-tab-files">
              Files
              {multiFile ? (
                <span className="rounded-full bg-muted px-1.5 text-[10px] leading-4 text-muted-foreground">
                  {manifest.assets.length}
                </span>
              ) : null}
            </TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="min-w-0 flex-1" />
        {tab === "preview" && !isEmpty ? (
          <>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setPreviewNonce((n) => n + 1);
                void sessionQuery.refetch();
              }}
              title="Reload preview"
              aria-label="Reload preview"
            >
              <HugeiconsIcon icon={RefreshIcon} strokeWidth={1.8} />
              <span className="hidden sm:inline">Refresh</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={onOpenPreview}
              disabled={openPreviewMutation.isPending}
              title="Open rendered site in a new tab"
              aria-label="Open in new tab"
            >
              <HugeiconsIcon icon={LinkSquare01Icon} strokeWidth={1.8} />
              <span className="hidden sm:inline">Open in new tab</span>
            </Button>
          </>
        ) : null}
        {tab === "code" ? (
          <span className="hidden items-center gap-1.5 font-mono text-xs text-muted-foreground sm:inline-flex">
            <HugeiconsIcon icon={CodeIcon} strokeWidth={1.8} className="size-3.5" />
            {manifest.entry}
          </span>
        ) : null}
      </div>

      <main className="min-h-0 flex-1 overflow-hidden">
        {tab === "preview" ? (
          <PreviewPane
            url={entryUrl}
            nonce={previewNonce}
            version={version}
            error={
              sessionQuery.isError ? errorMessage(sessionQuery.error, "preview unavailable") : null
            }
            title={loaded.meta.name}
          />
        ) : null}

        {tab === "code" ? (
          <div className="h-full" data-testid="site-code-pane">
            {source === null ? (
              <div className="flex h-full items-center justify-center p-8 text-sm text-muted-foreground">
                {sourceError ?? "Loading source…"}
              </div>
            ) : (
              <CodeMirrorEditor
                key={`${manifest.entry}`}
                value={source}
                onChange={setSource}
                readOnly={!writable}
                dark={theme === "dark"}
                fontFamily='ui-monospace, "JetBrains Mono Variable", SFMono-Regular, Menlo, monospace'
                language="html"
              />
            )}
          </div>
        ) : null}

        {tab === "files" ? (
          <div className="h-full overflow-y-auto">
            <div
              className={cn(
                "mx-auto grid w-full max-w-6xl gap-5 px-4 py-6 sm:px-6",
                "lg:grid-cols-12",
              )}
            >
              <div className={cn("lg:col-span-7", !writable && "lg:col-span-12")}>
                <SiteCard
                  entry={manifest.entry}
                  isEmpty={isEmpty}
                  fileCount={manifest.assets.length}
                  totalLabel={formatBytes(totalBytes)}
                  onOpen={onOpenPreview}
                  openPending={openPreviewMutation.isPending}
                />
              </div>

              {writable ? (
                <div className="lg:col-span-5">
                  <UploadPanel
                    isEmpty={isEmpty}
                    filesPending={uploadFilesMutation.isPending}
                    zipPending={uploadZipMutation.isPending}
                    onUploadFiles={(entries) => uploadFilesMutation.mutate(entries)}
                    onUploadZip={(zip) => uploadZipMutation.mutate(zip)}
                  />
                </div>
              ) : null}

              <div className="lg:col-span-12">
                <FilesList
                  manifest={manifest}
                  totalLabel={totalLabel}
                  writable={writable}
                  busy={setEntryMutation.isPending || deleteAssetMutation.isPending}
                  onSetEntry={(path) => setEntryMutation.mutate(path)}
                  onDelete={(path) => deleteAssetMutation.mutate(path)}
                />
              </div>
            </div>
          </div>
        ) : null}
      </main>

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

// ─── Preview pane ───────────────────────────────────────────────────

function PreviewPane({
  url,
  nonce,
  version,
  error,
  title,
}: {
  url: string | null;
  nonce: number;
  version: number;
  error: string | null;
  title: string;
}) {
  if (error) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center text-sm text-muted-foreground">
        <HugeiconsIcon icon={Alert02Icon} strokeWidth={1.8} className="size-5 text-destructive" />
        {error}
      </div>
    );
  }
  if (!url) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-sm text-muted-foreground">
        Preparing preview…
      </div>
    );
  }
  return (
    <iframe
      // Remount on refresh / new bundle version so the page really reloads.
      key={`${version}:${nonce}`}
      title={`${title} preview`}
      src={`${url}?v=${version}-${nonce}`}
      // Scripts run, but in an opaque origin: no cookies / DOM access to Inkwell.
      sandbox="allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-modals allow-downloads"
      referrerPolicy="no-referrer"
      data-testid="site-preview"
      className="h-full w-full border-0 bg-white"
    />
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

function totalSize(m: StaticSiteFileBlob): number {
  return m.assets.reduce((a, b) => a + b.size, 0);
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

/** Percent-encode each path segment without touching the slashes. The
 *  signed URL prefix already contains the asset id + sig; relpath
 *  must be safe to splice in. */
function encodePath(p: string): string {
  return p.split("/").map(encodeURIComponent).join("/");
}
