// FileViewerPage — owner page for `kind === "file"` at /f/:id.
//
// `files.load` answers 415 for uploaded files (no JSON blob), so
// `EditorPage` hands over to this page, which reads `files.meta` and
// streams bytes through `files.rawUrl`. Same unified header as the
// editors (rename, breadcrumb, Share, ⋯ with Download / Duplicate /
// Move / Rename / Tags / Star / Trash), without a save state.
//
// First open of an image without a thumbnail generates one client-side
// so collection cards get a preview.

import {
  ArrowLeft01Icon,
  Copy01Icon,
  Delete02Icon,
  Download01Icon,
  Edit02Icon,
  KeyboardIcon,
  StarIcon,
} from "@hugeicons/core-free-icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { openShortcutSheet } from "@/components/shell/shellStore";
import { itemActions } from "@/features/actions/useItemActions";
import { imageToThumbSvg, isThumbnailableImage } from "@/features/upload";
import { ApiError, files, type ItemRef } from "@/lib/api/client";
import type { Command } from "@/lib/commands/registry";
import { errorMessage } from "@/lib/errors";
import { EditorErrorState, EditorLoadingState } from "./EditorChrome";
import { EditorHeader } from "./EditorHeader";
import { EditorOverlays } from "./EditorOverlays";
import { staticBridge } from "./editorHeaderBridge";
import { FileViewer } from "./FileViewer";
import { EditorDropZone } from "./shared/EditorDropZone";

function folderUrl(folderId: string | null): string {
  return folderId ? `/folders/${folderId}` : "/inbox";
}

export function FileViewerPage({ id }: { id: string }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const metaKey = useMemo(() => ["files", "viewer-meta", id] as const, [id]);
  const metaQuery = useQuery({
    queryKey: metaKey,
    queryFn: () => files.meta(id),
    retry: false,
  });
  const meta = metaQuery.data;
  const ref = useMemo<ItemRef>(() => ({ type: "file", id }), [id]);
  const [renameNonce, setRenameNonce] = useState(0);
  const refresh = useCallback(() => {
    void qc.invalidateQueries({ queryKey: metaKey, exact: true });
  }, [qc, metaKey]);

  // Thumbnail for images that don't have one yet (owner only; best effort, once).
  const thumbTried = useRef<string | null>(null);
  useEffect(() => {
    if (!meta || meta.hasThumb || thumbTried.current === meta.id) return;
    if (!meta.mime || !isThumbnailableImage(new Blob([], { type: meta.mime }))) return;
    thumbTried.current = meta.id;
    void (async () => {
      try {
        const resp = await fetch(files.rawUrl(meta.id), { credentials: "include" });
        if (!resp.ok) return;
        const svg = await imageToThumbSvg(await resp.blob());
        if (!svg) return;
        await files.putThumb(meta.id, svg);
        void qc.invalidateQueries({ queryKey: ["files", "list"] });
        void qc.invalidateQueries({ queryKey: ["folders", "list"] });
        refresh();
      } catch {
        /* the placeholder glyph stays */
      }
    })();
  }, [meta, qc, refresh]);

  const folderId = meta?.folderId ?? null;
  const starred = meta?.starredAt != null;
  const handleBack = useCallback(
    () => navigate(`${folderUrl(folderId)}?select=file:${id}`),
    [navigate, folderId, id],
  );

  const toggleStar = useCallback(() => {
    void itemActions.setStar([ref], !starred).finally(refresh);
  }, [ref, starred, refresh]);
  const duplicate = useCallback(() => void itemActions.duplicate([ref]), [ref]);
  const download = useCallback(() => void itemActions.download([ref]), [ref]);
  const trash = useCallback(async () => {
    await itemActions.trash([ref]);
    const gone = await files.meta(id).then(
      () => false,
      (e) => e instanceof ApiError && e.status === 404,
    );
    if (!gone) return;
    qc.removeQueries({ queryKey: metaKey, exact: true });
    navigate(folderUrl(folderId));
  }, [ref, id, qc, metaKey, navigate, folderId]);
  const rename = useCallback(
    async (next: string) => {
      try {
        await itemActions.rename(ref, next);
      } catch {
        return false;
      }
      refresh();
      return true;
    },
    [ref, refresh],
  );

  const overrides = useMemo<Command[]>(
    () => [
      {
        id: "item.rename",
        icon: Edit02Icon,
        label: "Rename",
        keys: ["f2"],
        group: "file",
        run: () => setRenameNonce((n) => n + 1),
      },
      {
        id: "item.star",
        icon: StarIcon,
        label: starred ? "Unstar" : "Star",
        group: "organise",
        run: toggleStar,
      },
      {
        id: "item.duplicate",
        icon: Copy01Icon,
        label: "Duplicate",
        group: "organise",
        run: duplicate,
      },
      {
        id: "item.download",
        icon: Download01Icon,
        label: "Download",
        group: "file",
        run: download,
      },
      {
        id: "item.trash",
        icon: Delete02Icon,
        label: "Move to Trash",
        group: "organise",
        destructive: true,
        run: () => void trash(),
      },
      {
        id: "nav.back",
        icon: ArrowLeft01Icon,
        label: "Back to folder",
        keys: ["mod+["],
        group: "navigate",
        palette: true,
        run: handleBack,
      },
      {
        id: "app.shortcuts",
        icon: KeyboardIcon,
        label: "Keyboard shortcuts",
        keys: ["mod+shift+/"],
        group: "app",
        run: () => openShortcutSheet(),
      },
    ],
    [starred, toggleStar, duplicate, download, trash, handleBack],
  );

  if (metaQuery.isError) {
    return <EditorErrorState message={errorMessage(metaQuery.error, "load failed")} />;
  }
  if (!meta) return <EditorLoadingState label="Loading file…" />;

  return (
    <div className="flex h-dvh w-full flex-col overflow-hidden bg-background">
      <EditorHeader
        bridge={staticBridge()}
        file={{
          id,
          name: meta.name,
          kind: meta.kind,
          version: meta.version,
          folderId: meta.folderId,
        }}
        onBack={handleBack}
        onNavigateFolder={(fid) => navigate(folderUrl(fid))}
        onRename={rename}
        renameNonce={renameNonce}
        starred={starred}
        onToggleStar={toggleStar}
        onShare={() => itemActions.share(ref)}
        onMove={() => itemActions.moveDialog([ref])}
        onDuplicate={duplicate}
        onDownload={download}
        onEditTags={() => itemActions.editTags([ref])}
        onTrash={() => void trash()}
      />
      <main className="min-h-0 flex-1">
        <FileViewer
          name={meta.name}
          mime={meta.mime}
          sizeBytes={meta.sizeBytes}
          rawUrl={files.rawUrl(id)}
          downloadUrl={files.downloadUrl(id)}
        />
      </main>
      <EditorOverlays file={ref} overrides={overrides} />
      <EditorDropZone folderId={folderId} onOpenFolder={() => navigate(folderUrl(folderId))} />
    </div>
  );
}
