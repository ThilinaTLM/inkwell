// SharedEditor handles both forms of share token:
//   /share/:token                  → file-share (loads /api/share/:token)
//   /share/:token/files/:fileId    → folder-share file (loads /api/share/:token/files/:fileId)
//
// Same layout as the owner editor: `<EditorHeader>` in visitor mode
// (no owner actions; "Shared · View only / Can edit"; Download when the
// link allows it) above the editor surface. The header's back button
// returns to the shared folder on folder-share file routes; on a
// top-level file-share token there's no parent and it's hidden.
// Read-only shares get the canvas in view mode.

import { useQueryClient } from "@tanstack/react-query";
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useSharedFile } from "@/data/shares";
import type { FileBlob, LoadedFile } from "@/lib/api/client";
import { shares } from "@/lib/api/client";
import { keys } from "@/lib/api/query-keys";
import { errorMessage } from "@/lib/errors";
import { useTheme } from "@/lib/theme";
import { EditorErrorState, EditorLoadingState } from "./EditorChrome";
import { EditorHeader } from "./EditorHeader";
import type { RenderEditorHeader } from "./editorHeaderBridge";
import { SharedStaticSitePreviewRedirect } from "./StaticSitePreviewRedirect";

const DrawioEditor = lazy(() => import("@/features/editor/DrawioEditor"));
const ExcalidrawEditor = lazy(() => import("@/features/editor/ExcalidrawEditor"));
const ExcalidrawMenu = lazy(() => import("@/features/editor/ExcalidrawMenu"));
const NotesEditor = lazy(() => import("@/features/editor/NotesEditor"));

function EditorSuspense({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<EditorLoadingState label="Loading editor…" />}>{children}</Suspense>;
}

interface SharedEditorProps {
  /** Optional preloaded file; used by SharedTokenLanding to avoid a double fetch. */
  preloaded?: LoadedFile;
}

export function SharedEditorPage({ preloaded }: SharedEditorProps = {}) {
  const params = useParams<{ token: string; fileId?: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const token = params.token || "";
  const fileId = params.fileId; // present only on folder-share routes

  // Skip the network when the parent page already resolved the file.
  const fileQuery = useSharedFile(preloaded ? "" : token, fileId);

  const [loaded, setLoaded] = useState<LoadedFile | null>(preloaded ?? null);
  // Non-blocking conflict banner after a 409 → reload (see EditorPage).
  const [conflict, setConflict] = useState(false);
  const [editorKey, setEditorKey] = useState(0);
  const { mode: themeMode, setMode: setThemeMode } = useTheme();

  // Seed working copy on first arrival; thereafter the editor owns it.
  useEffect(() => {
    if (loaded) return;
    if (fileQuery.data) setLoaded(fileQuery.data);
  }, [fileQuery.data, loaded]);

  // Force-fresh reload after a 409 conflict.
  const reload = useCallback(async () => {
    const ls = await qc.fetchQuery({
      queryKey: keys.publicShare.token(token, fileId),
      queryFn: () => (fileId ? shares.loadFolderFile(token, fileId) : shares.load(token)),
      staleTime: 0,
    });
    setLoaded(ls);
    setConflict(true);
    return ls;
  }, [qc, token, fileId]);

  const loadedRef = useRef(loaded);
  loadedRef.current = loaded;
  const save = useCallback(
    async (version: number, blob: FileBlob) => {
      const m = fileId
        ? await shares.saveFolderFile(token, fileId, version, blob)
        : await shares.save(token, version, blob);
      const prev = loadedRef.current;
      const nextLoaded: LoadedFile = {
        meta: {
          id: prev?.meta.id ?? fileId ?? "",
          name: m.name,
          kind: m.kind,
          version: m.version,
          updatedAt: m.updatedAt,
          folderId: prev?.meta.folderId ?? null,
          hasThumb: prev?.meta.hasThumb ?? false,
          starredAt: prev?.meta.starredAt ?? m.starredAt ?? null,
        },
        blob,
        permission: prev?.permission ?? "write",
        allowDownload: prev?.allowDownload ?? true,
        sharedBy: prev?.sharedBy ?? null,
        shareExpiresAt: prev?.shareExpiresAt ?? null,
      };
      setLoaded(nextLoaded);
      qc.setQueryData(keys.publicShare.token(token, fileId), nextLoaded);
      return { version: m.version };
    },
    [qc, token, fileId],
  );

  if (fileQuery.isError) {
    return (
      <EditorErrorState message={errorMessage(fileQuery.error, "could not load shared file")} />
    );
  }
  if (!loaded) return <EditorLoadingState label="Loading shared file…" />;

  const writable = loaded.permission === "write";
  const downloadHref = fileId
    ? shares.folderFileDownloadUrl(token, fileId)
    : shares.downloadUrl(token);

  if (loaded.meta.kind === "static-site") {
    // Share-token visitors don't see the management surface for
    // static-site bundles — the file tree is an owner concept. We
    // bounce to the signed preview URL exactly the way the top-level
    // `/share/:token` dispatcher does for file shares, but minting
    // through the folder-share render endpoint when this is a
    // folder-share child (fileId present). The share render-session
    // endpoint re-checks `findActive`, so revoking the share kills
    // the outstanding session immediately.
    return (
      <SharedStaticSitePreviewRedirect token={token} fileId={fileId ?? null} blob={loaded.blob} />
    );
  }

  const renderHeader: RenderEditorHeader = (bridge) => (
    <EditorHeader
      bridge={bridge}
      file={{
        id: loaded.meta.id,
        name: loaded.meta.name,
        kind: loaded.meta.kind,
        version: loaded.meta.version,
        folderId: null,
      }}
      onBack={fileId ? () => navigate(`/share/${token}`) : null}
      backLabel="Back to shared folder"
      visitor={{
        expiresAt: loaded.shareExpiresAt,
        sharedBy: loaded.sharedBy
          ? `${loaded.sharedBy.firstName} ${loaded.sharedBy.lastName}`.trim() || null
          : null,
        permission: loaded.permission,
        allowDownload: loaded.allowDownload,
        onDownload: () => {
          void bridge.flush().then(() => {
            window.location.href = downloadHref;
          });
        },
      }}
      conflict={
        conflict
          ? {
              onReload: () => {
                bridge.discard();
                setConflict(false);
                setEditorKey((k) => k + 1);
              },
              onDismiss: () => setConflict(false),
            }
          : null
      }
    />
  );

  const common = {
    loaded,
    save: writable ? save : async () => ({ version: loaded.meta.version }),
    // No thumbnail uploads from share-token sessions — only the
    // owner's saves should advance the canonical thumb.
    saveThumb: null,
    reload,
    onReload: (ls: LoadedFile) => setLoaded(ls),
    renderHeader,
  };

  if (loaded.meta.kind === "drawio") {
    return (
      <EditorSuspense>
        <div className="h-dvh w-full overflow-hidden bg-background">
          <DrawioEditor key={editorKey} {...common} />
        </div>
      </EditorSuspense>
    );
  }

  if (loaded.meta.kind === "notes") {
    return (
      <EditorSuspense>
        <div className="h-dvh w-full overflow-hidden bg-background">
          <NotesEditor key={editorKey} {...common} />
        </div>
      </EditorSuspense>
    );
  }

  return (
    <EditorSuspense>
      <div className="h-dvh w-full overflow-hidden bg-background">
        <ExcalidrawEditor
          key={editorKey}
          {...common}
          chrome={
            <ExcalidrawMenu variant="shared" theme={themeMode} onSelectTheme={setThemeMode} />
          }
        />
      </div>
    </EditorSuspense>
  );
}
