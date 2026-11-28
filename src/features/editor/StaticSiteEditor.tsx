// StaticSiteEditor — viewer / editor for `kind === "static-site"`.
//
// A static-site file is a bundle of HTML/CSS/JS/image assets; the common
// case — a single self-contained `.html` artifact — behaves like a
// document. Three modes, switched from the editor header's toolbar slot:
//
//   Preview  the rendered page inside a framed canvas (reload, page
//            picker, device-width presets, open in new tab). Saved state
//            comes from the signed render-session URL
//            (`/sites/:id/:sig/<page>`); with unsaved edits it shows a
//            live draft (`srcdoc`, see draftPreview.ts).
//   Split    file tree + code + live preview side by side (wide screens).
//   Code     one workspace: a file tree (plus an "Overview & uploads"
//            page with the bundle table and the drop zone) next to a
//            themed CodeMirror for the selected file. Edits across
//            several files (including new files) are kept as a buffer
//            and saved together (Ctrl/⌘+S → one assets POST with
//            `If-Match`; every save is a new bundle version, no autosave).
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

import {
  ArrowDown01Icon,
  CodeIcon,
  File01Icon,
  Layout2ColumnIcon,
  SidebarLeftIcon,
  ViewIcon,
} from "@hugeicons/core-free-icons";
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
import { Button } from "@/components/ui/button";
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
import { useMediaQuery } from "@/lib/useMediaQuery";
import { cn } from "@/lib/utils";
import type { EditorExporter, EditorHeaderBridge, RenderEditorHeader } from "./editorHeaderBridge";
import { LeaveConfirmDialog } from "./lifecycle/LeaveConfirmDialog";
import type { EditorSaveStatus } from "./lifecycle/types";
import { useLeaveConfirm } from "./lifecycle/useLeaveConfirm";
import { downloadBlob, exportBaseName } from "./shared/exportFile";
import { type BufferState, CodePane } from "./static-site/CodePane";
import { FilesList } from "./static-site/FilesList";
import { FileTree } from "./static-site/FileTree";
import { NewFileDialog } from "./static-site/NewFileDialog";
import { PreviewFrame } from "./static-site/PreviewFrame";
import { SiteCard } from "./static-site/SiteCard";
import { SPLIT_MAX, SPLIT_MIN, SplitDivider } from "./static-site/SplitDivider";
import {
  baseName,
  byteLength,
  encodePath,
  isHtmlPath,
  isImageAsset,
  isTextAsset,
  looksLikePlaceholder,
  MAX_EDITABLE_BYTES,
  starterFor,
  TEMPLATE_HTML,
} from "./static-site/sitePaths";
import { UploadPanel } from "./static-site/UploadPanel";
import { useDraftPreview } from "./static-site/useDraftPreview";

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

type Mode = "preview" | "split" | "code";

const MODE_KEY = "inkwell:site-editor-mode";
const SPLIT_KEY = "inkwell:site-editor-split";
function readStored(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}
function writeStored(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Private mode / quota — the preference just doesn't persist.
  }
}
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

  const wide = useMediaQuery("(min-width: 1100px)");
  const [mode, setMode] = useState<Mode>(() => {
    if (isEmpty) return "code";
    const stored = readStored(MODE_KEY);
    if (stored === "preview" || stored === "split" || stored === "code") return stored;
    return writable && wide ? "split" : "preview";
  });
  // Split needs room: on narrow screens it degrades to the Preview view.
  const effMode: Mode = isEmpty ? "code" : mode === "split" && !wide ? "preview" : mode;
  const changeMode = useCallback((m: Mode) => {
    setMode(m);
    writeStored(MODE_KEY, m);
  }, []);
  const [splitPct, setSplitPct] = useState(() => {
    const n = Number(readStored(SPLIT_KEY));
    return Number.isFinite(n) && n >= SPLIT_MIN && n <= SPLIT_MAX ? n : 50;
  });
  const onSplitChange = useCallback((n: number) => {
    setSplitPct(n);
    writeStored(SPLIT_KEY, String(Math.round(n)));
  }, []);
  const splitRef = useRef<HTMLDivElement>(null);
  const [treeHidden, setTreeHidden] = useState(false);
  // Selected file in the code workspace; `null` = Overview & uploads.
  const [selected, setSelected] = useState<string | null>(isEmpty ? null : manifest.entry);
  const [previewPath, setPreviewPath] = useState<string>(manifest.entry);
  const [treeOpen, setTreeOpen] = useState(false);
  const [newFileOpen, setNewFileOpen] = useState(false);
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
  // Files created in the editor and not saved yet (path → created-at ms).
  const [created, setCreated] = useState<Record<string, number>>({});
  const createdRef = useRef(created);
  createdRef.current = created;
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

  // The bundle as the user sees it: server assets with buffer sizes for
  // edited files, plus files created locally.
  const viewManifest = useMemo<StaticSiteFileBlob>(() => {
    const assets = manifest.assets.map((a) =>
      edits[a.path] !== undefined ? { ...a, size: byteLength(edits[a.path]) } : a,
    );
    for (const [path, at] of Object.entries(created)) {
      if (assets.some((a) => a.path === path)) continue;
      assets.push({
        path,
        size: byteLength(edits[path] ?? ""),
        contentType: mimeFor(path),
        updatedAt: at,
      });
    }
    return { ...manifest, assets };
  }, [manifest, edits, created]);
  const hasAny = viewManifest.assets.length > 0;
  const htmlPages = useMemo(
    () => viewManifest.assets.filter((a) => isHtmlPath(a.path)).map((a) => a.path),
    [viewManifest.assets],
  );
  const pagePath = htmlPages.includes(previewPath) ? previewPath : manifest.entry;

  const selectedAsset = selected
    ? (viewManifest.assets.find((a) => a.path === selected) ?? null)
    : null;
  // Selected file vanished (deleted elsewhere / replaced by a zip).
  useEffect(() => {
    if (selected && !selectedAsset && hasAny) setSelected(manifest.entry);
  }, [selected, selectedAsset, hasAny, manifest.entry]);
  // Created files that now exist on the server are ordinary files.
  useEffect(() => {
    const live = new Set(manifest.assets.map((a) => a.path));
    setCreated((c) => {
      const keep = Object.entries(c).filter(([p]) => !live.has(p));
      return keep.length === Object.keys(c).length ? c : Object.fromEntries(keep);
    });
  }, [manifest.assets]);

  // Load the selected text file the first time it is opened.
  const failedRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (effMode === "preview" || !selectedAsset || !fileUrl) return;
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
  }, [effMode, selectedAsset, fileUrl, texts, version, epoch]);

  const onEdit = useCallback((path: string, text: string) => {
    setEdits((prev) => {
      const base = textsRef.current[path];
      if (text === base && !(path in createdRef.current)) {
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
      const live = new Set([
        ...result.manifest.assets.map((a) => a.path),
        ...Object.keys(createdRef.current),
      ]);
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
            setPreviewPath(r.manifest.entry);
            setMode("preview");
          } else if (r.manifest.assets.length === 0) {
            setMode("code");
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
          setPreviewPath(r.manifest.entry);
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
          setMode(wide ? "split" : "code");
        },
      },
    );
  }, [uploadFilesMutation, wide]);

  const setEntry = useCallback(
    (path: string) => {
      if (path in createdRef.current) {
        toast.info("Save the new file first, then set it as the entry page.");
        return;
      }
      setEntryMutation.mutate(path, { onSuccess: () => setPreviewPath(path) });
    },
    [setEntryMutation],
  );

  const createFile = useCallback(
    (path: string) => {
      setTexts((t) => ({ ...t, [path]: "" }));
      setEdits((e) => ({ ...e, [path]: starterFor(path) }));
      setCreated((c) => ({ ...c, [path]: Date.now() }));
      setSelected(path);
      setTreeOpen(false);
      if (isHtmlPath(path)) setPreviewPath(path);
      setMode((m) => (m === "preview" ? (wide ? "split" : "code") : m));
    },
    [wide],
  );

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
    setCreated({});
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

  // ── Live draft preview ───────────────────────────────────────────
  const draft = dirty && writable;
  const { srcDoc } = useDraftPreview({
    enabled: draft && effMode !== "code" && !isEmpty,
    prefix,
    version,
    pagePath,
    edits,
    texts,
    nonce: previewNonce,
  });

  // Placeholder site (the server's default page / first-run template):
  // offer "Edit code" / "Upload files" right in the preview.
  const [placeholder, setPlaceholder] = useState(false);
  useEffect(() => {
    const only = manifest.assets.length === 1 ? manifest.assets[0] : null;
    if (!writable || !fileUrl || !only || !isHtmlPath(only.path) || only.size > 2500) {
      setPlaceholder(false);
      return;
    }
    let cancelled = false;
    void fetch(`${fileUrl(only.path)}?v=${version}`)
      .then((r) => (r.ok ? r.text() : ""))
      .then((t) => {
        if (!cancelled) setPlaceholder(looksLikePlaceholder(t));
      })
      .catch(() => {
        if (!cancelled) setPlaceholder(false);
      });
    return () => {
      cancelled = true;
    };
  }, [manifest.assets, writable, fileUrl, version]);

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
        value={effMode}
        onChange={changeMode}
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
          ...(wide
            ? [
                {
                  value: "split" as const,
                  disabled: isEmpty,
                  title: "Code and live preview side by side",
                  label: (
                    <span
                      className="inline-flex items-center gap-1.5"
                      data-testid="site-mode-split"
                    >
                      <HugeiconsIcon
                        icon={Layout2ColumnIcon}
                        strokeWidth={1.8}
                        className="size-3.5"
                      />
                      <span className="sr-only sm:not-sr-only">Split</span>
                    </span>
                  ),
                },
              ]
            : []),
          {
            value: "code",
            title: "Files and code",
            label: (
              <span className="inline-flex items-center gap-1.5" data-testid="site-mode-files">
                <HugeiconsIcon icon={CodeIcon} strokeWidth={1.8} className="size-3.5" />
                <span className="sr-only sm:not-sr-only">Code</span>
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
    [effMode, changeMode, wide, isEmpty, dirty],
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
      autosave: false,
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
    if (isHtmlPath(p)) setPreviewPath(p);
    setTreeOpen(false);
  };
  const showOverview = () => {
    setSelected(null);
    setTreeOpen(false);
  };
  const deleteFile = (p: string) => {
    if (p in createdRef.current) {
      // Never saved: just forget the local buffer.
      setCreated(({ [p]: _c, ...rest }) => rest);
      setEdits(({ [p]: _e, ...rest }) => rest);
      setTexts(({ [p]: _t, ...rest }) => rest);
      if (selected === p) setSelected(manifest.entry);
      return;
    }
    deleteAssetMutation.mutate(p, {
      onSuccess: () => {
        if (selected === p) setSelected(manifest.entry);
      },
    });
  };

  // ── Render ────────────────────────────────────────────────────────
  const renderPreview = (compact: boolean) => (
    <PreviewFrame
      url={prefix ? prefix + encodePath(pagePath) : null}
      pagePath={pagePath}
      pages={htmlPages}
      onPageChange={setPreviewPath}
      nonce={previewNonce}
      version={version}
      error={sessionQuery.isError ? errorMessage(sessionQuery.error, "preview unavailable") : null}
      title={loaded.meta.name}
      onRefresh={refreshPreview}
      onOpen={onOpenPreview}
      openPending={openPreviewMutation.isPending}
      draft={draft}
      srcDoc={srcDoc}
      writable={writable}
      onSave={() => void saveSource()}
      compact={compact}
      hint={
        placeholder && !dirty && effMode === "preview"
          ? {
              onEdit: () => {
                setSelected(manifest.entry);
                changeMode(wide ? "split" : "code");
              },
              onUpload: () => {
                setSelected(null);
                changeMode(wide ? "split" : "code");
              },
            }
          : null
      }
    />
  );

  const content = selectedAsset ? (
    <CodePane
      asset={selectedAsset}
      size={selectedAsset.size}
      isNew={selectedAsset.path in created}
      isEntry={selectedAsset.path === manifest.entry}
      writable={writable}
      dark={theme === "dark"}
      buffer={buffer}
      editorKey={`${selectedAsset.path}:${epoch}`}
      imageUrl={fileUrl ? fileUrl(selectedAsset.path) : null}
      busy={mutating}
      onChange={(t) => onEdit(selectedAsset.path, t)}
      onSetEntry={() => setEntry(selectedAsset.path)}
      onDelete={() => setConfirmDelete(selectedAsset.path)}
    />
  ) : (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-5 px-4 py-6 sm:px-6">
        {writable ? (
          <div className="flex justify-end">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setNewFileOpen(true)}
              data-testid="site-new-file-overview"
            >
              <HugeiconsIcon icon={File01Icon} strokeWidth={1.8} />
              New file
            </Button>
          </div>
        ) : null}
        {hasAny ? (
          <SiteCard
            manifest={viewManifest}
            writable={writable}
            busy={mutating}
            onOpen={onOpenPreview}
            openPending={openPreviewMutation.isPending}
            onSetEntry={setEntry}
          />
        ) : null}
        {writable ? (
          <UploadPanel
            isEmpty={!hasAny}
            pending={pending}
            onUploadFiles={uploadFiles}
            onUploadZip={uploadZip}
            onUseTemplate={useTemplate}
          />
        ) : !hasAny ? (
          <p className="py-16 text-center text-sm text-muted-foreground">
            This site has no files yet.
          </p>
        ) : null}
        {hasAny ? (
          <FilesList
            manifest={viewManifest}
            writable={writable}
            busy={mutating}
            fileUrl={fileUrl}
            onOpen={selectFile}
            onSetEntry={setEntry}
            onDelete={deleteFile}
          />
        ) : null}
      </div>
    </div>
  );

  return (
    <Surface variant="page" className="flex h-dvh flex-col">
      {renderHeader?.(bridge)}

      <main className="min-h-0 flex-1 overflow-hidden">
        {effMode === "preview" ? (
          renderPreview(false)
        ) : (
          <div className="flex h-full min-h-0 flex-col md:flex-row" data-testid="site-files-pane">
            {hasAny ? (
              <>
                {/* Mobile: collapsible picker; desktop: sidebar */}
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
                      {viewManifest.assets.length} files
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
                      assets={viewManifest.assets}
                      entry={manifest.entry}
                      selected={selected}
                      dirty={dirtyPaths}
                      onSelect={selectFile}
                      onOverview={showOverview}
                      onNewFile={writable ? () => setNewFileOpen(true) : undefined}
                    />
                  ) : null}
                </div>
                {treeHidden ? (
                  <div className="hidden w-10 shrink-0 flex-col items-center gap-1 border-r border-border/60 bg-card/40 py-2 md:flex">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => setTreeHidden(false)}
                      title="Show files"
                      aria-label="Show files"
                    >
                      <HugeiconsIcon icon={SidebarLeftIcon} strokeWidth={1.8} />
                    </Button>
                    {writable ? (
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => setNewFileOpen(true)}
                        title="New file"
                        aria-label="New file"
                      >
                        <HugeiconsIcon icon={File01Icon} strokeWidth={1.8} />
                      </Button>
                    ) : null}
                  </div>
                ) : (
                  <FileTree
                    className={cn(
                      "hidden shrink-0 border-r border-border/60 bg-card/40 md:flex",
                      effMode === "split" ? "w-56" : "w-64",
                    )}
                    assets={viewManifest.assets}
                    entry={manifest.entry}
                    selected={selected}
                    dirty={dirtyPaths}
                    onSelect={selectFile}
                    onOverview={showOverview}
                    onNewFile={writable ? () => setNewFileOpen(true) : undefined}
                    onCollapse={() => setTreeHidden(true)}
                  />
                )}
              </>
            ) : null}

            {effMode === "split" ? (
              <div ref={splitRef} className="flex min-h-0 min-w-0 flex-1">
                <div className="min-h-0 min-w-0 shrink-0" style={{ width: `${splitPct}%` }}>
                  {content}
                </div>
                <SplitDivider value={splitPct} onChange={onSplitChange} containerRef={splitRef} />
                <div className="min-h-0 min-w-0 flex-1">{renderPreview(true)}</div>
              </div>
            ) : (
              <div className="min-h-0 min-w-0 flex-1">{content}</div>
            )}
          </div>
        )}
      </main>

      <NewFileDialog
        open={newFileOpen}
        onOpenChange={setNewFileOpen}
        existing={viewManifest.assets.map((a) => a.path)}
        initial={hasAny ? undefined : "index.html"}
        onCreate={createFile}
      />

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
