// StaticSiteEditor — management surface for `kind === "static-site"`.
//
// This is **not** an editor in the traditional sense — there is no
// canvas, no autosave, no in-place editing. A static-site file is a
// bundle of HTML/CSS/JS/image assets authored elsewhere (typically by
// the richdoc CLI). The job of this page is:
//
//   1. Show what's in the bundle (file list, entry page, sizes).
//   2. Let the owner modify the bundle (upload, replace via ZIP,
//      delete, change entry).
//   3. Expose the rendered site as a one-click new-tab open at
//      `/sites/:id/:sig/<entry>` (signed). Share-token visitors
//      never see this management surface — they are redirected
//      straight to the signed `/shared/:token/:sig/<entry>` (or
//      `/shared/:token/files/:fileId/:sig/<entry>` for folder
//      shares) by `SharedTokenLandingPage` / `SharedEditorPage`.
//
// There is intentionally no inline iframe preview on this page —
// the rendered site lives at its own URL (`/sites/...` for the
// owner, `/shared/...` for share-token visitors), and the "Open"
// button on the site card (or topbar) is the only way in. That
// keeps this page focused on bundle management and avoids paying
// for a render-session every time the user navigates here.
//
// Security: see `StaticSitePreviewRedirect.tsx` for the signed-URL
// contract. The `mintSession` mutation here is the same mint used
// there, called lazily from the "Open" click handler so we don't
// pay for a session until the user actually wants one.
//
// Concurrency: every mutator (upload, delete, set-entry, ZIP-upload)
// is its own POST. We pass `If-Match: <version>` and surface 409s as
// a toast + manifest refetch. No autosave loop, no `useSaveLifecycle`
// scaffolding — those exist for content that's edited in-place.
//
// Layout: the page's `<EditorHeader>` (via `renderHeader`, with the
// "Open" button in its toolbar slot) above a two-column grid on `lg:` (SiteCard + UploadPanel side by
// side, FilesList full-width below). On `<lg` the columns stack.
// Subcomponents live in `./static-site/`.

import { LinkSquare01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Surface } from "@/components/Surface";
import { Button } from "@/components/ui/button";
import {
  type FileMeta,
  type LoadedFile,
  type StaticSiteFileBlob,
  type StaticSiteRenderSession,
  staticSites,
} from "@/lib/api/client";
import { keys } from "@/lib/api/query-keys";
import { errorMessage } from "@/lib/errors";
import { cn } from "@/lib/utils";
import { type RenderEditorHeader, staticBridge } from "./editorHeaderBridge";
import { FilesList } from "./static-site/FilesList";
import { SiteCard } from "./static-site/SiteCard";
import { UploadPanel } from "./static-site/UploadPanel";

export interface StaticSiteEditorProps {
  loaded: LoadedFile;
  /** Renders the page header above the bundle manager (see `EditorHeader`). */
  renderHeader?: RenderEditorHeader;
  /** Override the render-session minter — defaults to owner's.
   *  Share-token viewers pass `() => shares.renderSession(token)`. */
  mintSession?: () => Promise<StaticSiteRenderSession>;
  /** When false, hides every mutation control (uploads, delete, entry).
   *  Used by the read-only share-token view. */
  writable?: boolean;
  /** Optional callback fired after a successful mutation so the
   *  parent can patch its own LoadedFile. */
  onManifestChanged?: (manifest: StaticSiteFileBlob, meta: FileMeta) => void;
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

  // Local version mirror — bumped on every successful mutation. The
  // server's `If-Match` precondition keeps two concurrent tabs honest.
  const [version, setVersion] = useState(loaded.meta.version);
  useEffect(() => {
    setVersion(loaded.meta.version);
  }, [loaded.meta.version]);

  // ── Mutation helpers ─────────────────────────────────────────────
  type MutResult = Awaited<ReturnType<typeof staticSites.uploadAssets>>;
  const onMutated = useCallback(
    (result: MutResult) => {
      setVersion(result.meta.version);
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

  // ── Open preview (lazy mint) ─────────────────────────────────────
  // We deliberately do NOT useQuery a render session on mount — this
  // page has no iframe, so a session is only needed when the user
  // actually clicks "Open". To avoid popup blockers (which fire when
  // `window.open` is called *after* an async hop), we open a blank
  // window synchronously inside the click handler and set its
  // `location.href` once the mint resolves.
  const openPreviewMutation = useMutation({
    mutationFn: mintSession ?? (() => staticSites.renderSession(id)),
  });

  const onOpenPreview = useCallback(() => {
    if (isEmpty) return;
    // NB: deliberately *no* `noopener` in the features string. With
    // `noopener` the browser specifies `window.open` returns null, so
    // we'd lose the handle we need to redirect the new tab once the
    // render session mints. We sever `win.opener` manually below
    // (after the redirect) to get the same isolation — the new tab
    // also loads with a null-origin sandbox CSP, so even without the
    // sever it couldn't read this window's DOM.
    const win = window.open("about:blank", "_blank");
    if (!win) {
      toast.error("Could not open a new tab (popup blocked?)");
      return;
    }
    openPreviewMutation.mutate(undefined, {
      onSuccess: (session) => {
        win.location.href = session.prefix + encodePath(manifest.entry);
        // Sever the link to this window once the navigation is in
        // flight. Some browsers null this out automatically on
        // cross-document navigation; doing it explicitly is harmless
        // and removes a footgun if a future signed URL ever resolves
        // to same-origin SPA content.
        try {
          win.opener = null;
        } catch {
          // Cross-origin reads on `win.opener` can throw after the
          // navigation begins — nothing to do here.
        }
      },
      onError: (e) => {
        win.close();
        toast.error(errorMessage(e, "preview unavailable"));
      },
    });
  }, [isEmpty, manifest.entry, openPreviewMutation]);

  const totalBytes = useMemo(() => totalSize(manifest), [manifest]);
  const totalLabel = `${manifest.assets.length} · ${formatBytes(totalBytes)}`;

  // ── Render ────────────────────────────────────────────────────────
  return (
    <Surface variant="page" className="flex h-dvh flex-col">
      {renderHeader?.(
        staticBridge({
          toolbar: (
            <Button
              variant="default"
              size="sm"
              onClick={onOpenPreview}
              disabled={isEmpty || openPreviewMutation.isPending}
              title={isEmpty ? "Upload files to enable preview" : "Open rendered site in a new tab"}
              aria-label="Open in new tab"
            >
              <HugeiconsIcon icon={LinkSquare01Icon} />
              <span className="hidden sm:inline">Open</span>
            </Button>
          ),
        }),
      )}

      {/* Main content: SiteCard + UploadPanel (or just SiteCard in
          read-only mode), then FilesList full-width below. */}
      <main className="min-h-0 flex-1 overflow-y-auto">
        <div
          className={cn("mx-auto grid w-full max-w-6xl gap-5 px-4 py-6 sm:px-6", "lg:grid-cols-12")}
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
      </main>
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
