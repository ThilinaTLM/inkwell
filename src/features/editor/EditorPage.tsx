// Editor — the owner's file page.
//
// Layout: `<EditorHeader>` (44px, rendered by each editor through its
// `renderHeader(bridge)` prop so the header sees live save state and
// routes navigation through the editor's leave-confirm guard) above the
// editor surface, which takes the full remaining height.
//
// The editor "owns" the working file copy after first arrival:
// `useFile(id)` is configured with `staleTime: Infinity` so it never
// refetches and clobbers unsaved edits. We seed local state from the
// query result on first arrival, then subsequent saves write back to
// both the cache (`setQueryData`) and the local state.
//
// Save remains a plain closure (NOT `useMutation`): the editors'
// autosave loop has its own dedup ref and 409-reload-and-reset
// semantics that don't compose cleanly with a mutation lifecycle.
//
// Header actions (Move / Duplicate / Trash / Tags / Star) call the
// existing dialogs and `items.*` APIs directly for now; they will be
// swapped to the shared command system later.

import { MainMenu } from "@excalidraw/excalidraw";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { useFile, useMoveFile, useRenameFile, useSetFileTags } from "@/data/files";
import { useFolders } from "@/data/folders";
import { invalidations } from "@/data/invalidations";
import { useTags } from "@/data/tags";
import { useMutationWithToast } from "@/data/useMutationWithToast";
import { MoveToFolderDialog } from "@/features/folders/MoveToFolderDialog";
import { ShareDialog } from "@/features/sharing/ShareDialog";
import { TagEditDialog } from "@/features/tags/TagEditDialog";
import { type FileBlob, type FilesQuery, files, items, type LoadedFile } from "@/lib/api/client";
import { keys } from "@/lib/api/query-keys";
import { errorMessage } from "@/lib/errors";
import { useTheme } from "@/lib/theme";
import DrawioEditor from "./DrawioEditor";
import { EditorErrorState, EditorLoadingState } from "./EditorChrome";
import { EditorHeader } from "./EditorHeader";
import ExcalidrawEditor from "./ExcalidrawEditor";
import type { EditorHeaderBridge, RenderEditorHeader } from "./editorHeaderBridge";
import NotesEditor from "./NotesEditor";
import StaticSiteEditor from "./StaticSiteEditor";

function folderUrl(folderId: string | null): string {
  return folderId ? `/folders/${folderId}` : "/";
}

export function EditorPage() {
  const { id = "" } = useParams<{ id: string }>();
  const qc = useQueryClient();

  const fileQuery = useFile(id);
  const tagsQuery = useTags();
  const foldersQuery = useFolders();
  const renameMutation = useRenameFile();
  const moveMutation = useMoveFile();
  const setTagsMutation = useSetFileTags();
  const runRename = useMutationWithToast(renameMutation, {
    success: (m) => `Renamed to "${m.name}".`,
    fallback: "rename failed",
  });
  const runMove = useMutationWithToast(moveMutation, {
    success: "Moved.",
    fallback: "move failed",
  });

  const navigate = useNavigate();
  const [loaded, setLoaded] = useState<LoadedFile | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [tagsOpen, setTagsOpen] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  // Set when the save lifecycle hit a 409 and re-fetched: shows the
  // non-blocking conflict banner in the header.
  const [conflict, setConflict] = useState(false);
  // Bumped by the conflict banner's Reload to remount the editor with
  // the freshly loaded copy.
  const [editorKey, setEditorKey] = useState(0);
  const [starOverride, setStarOverride] = useState<{ id: string; starred: boolean } | null>(null);
  const [tagsOverride, setTagsOverride] = useState<{ id: string; tags: string[] } | null>(null);
  // `mode`/`setMode` (rather than `resolved`/`toggle`) so the native
  // `MainMenu.DefaultItems.ToggleTheme` can render the three-state
  // light/dark/system picker our provider already supports.
  const { mode: themeMode, setMode: setThemeMode } = useTheme();

  // Seed the working copy on first arrival. After that the editor owns
  // it; we do NOT mirror further query updates here because that would
  // overwrite unsaved edits.
  useEffect(() => {
    if (loaded) return;
    if (fileQuery.data) setLoaded(fileQuery.data);
  }, [fileQuery.data, loaded]);

  // When navigating to a *different* file, reset the working copy so the
  // seed effect above re-runs against the new query data.
  //
  // Gated on a real id transition via a ref: on the initial mount React
  // would otherwise fire this effect alongside the seed effect in the same
  // commit, and `setLoaded(null)` would clobber `setLoaded(data)` whenever
  // the query cache is already warm (e.g. user opens a file, goes back,
  // opens it again).
  const prevIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (prevIdRef.current !== null && prevIdRef.current !== id) {
      setLoaded(null);
      setConflict(false);
    }
    prevIdRef.current = id;
  }, [id]);

  // The file's row in its folder listing — source of `starredAt` and
  // `tags`, which the `LoadedFile` meta doesn't carry. Usually already
  // cached by the explorer.
  const parentFolderId = loaded?.meta.folderId ?? null;
  const rowQueryArgs: FilesQuery = { folderId: parentFolderId ?? "root" };
  const rowQuery = useQuery({
    queryKey: keys.files.list(rowQueryArgs),
    queryFn: () => files.list(rowQueryArgs),
    enabled: !!loaded,
  });
  const row = rowQuery.data?.find((f) => f.id === id);
  const starred =
    starOverride?.id === id ? starOverride.starred : row ? row.starredAt != null : false;
  const fileTags = tagsOverride?.id === id ? tagsOverride.tags : (row?.tags ?? []);

  // Reload after a 409 conflict: bypass cache and force a fresh fetch.
  // Only the save lifecycle's conflict path calls this.
  const reload = useCallback(async () => {
    const ls = await qc.fetchQuery({
      queryKey: keys.files.detail(id),
      queryFn: () => files.load(id),
      staleTime: 0,
    });
    setLoaded(ls);
    setConflict(true);
    return ls;
  }, [qc, id]);

  // Save: throws ApiError(409) on version conflict so the editor's
  // autosave loop can react. On success update both local state and the
  // cached file detail row so revisiting this editor doesn't resurrect
  // an old version from React Query's staleTime/gcTime Infinity cache.
  const save = useCallback(
    async (version: number, blob: FileBlob) => {
      const m = await files.save(id, version, blob);
      const nextLoaded: LoadedFile = {
        meta: {
          id,
          name: m.name,
          kind: m.kind,
          version: m.version,
          updatedAt: m.updatedAt,
          folderId: loaded?.meta.folderId ?? null,
          // Once we've saved at least once, the editor's thumb pipeline
          // will have shipped (or is about to ship) a thumb. Server
          // `loadRow` is the source of truth on next cold load.
          hasThumb: loaded?.meta.hasThumb ?? false,
        },
        blob,
        permission: "write",
        allowDownload: true,
      };
      setLoaded(nextLoaded);
      qc.setQueryData(keys.files.detail(id), nextLoaded);
      // Update cached file-list rows so explorer views show fresh data.
      // Scope to list queries only — invalidating `keys.files.all` would
      // also match `keys.files.detail(id)` (prefix match) and trigger a
      // refetch of the active file on every save, racing the autosave loop.
      qc.invalidateQueries({ queryKey: ["files", "list"] });
      qc.invalidateQueries({ queryKey: ["folders", "list"] });
      return { version: m.version };
    },
    [id, loaded?.meta.folderId, loaded?.meta.hasThumb, qc],
  );

  const saveThumb = useCallback((svg: string) => files.putThumb(id, svg), [id]);

  // After a thumb upload, the server's `thumb_updated_at` advances.
  // Explorer cards build their `<img src>` from it, so list queries must
  // refetch for the new bust token to propagate.
  const onThumbSaved = useCallback(() => {
    qc.invalidateQueries({ queryKey: ["files", "list"] });
    qc.invalidateQueries({ queryKey: ["folders", "list"] });
  }, [qc]);

  // Back returns to the file's folder with the file selected so the
  // explorer can restore focus on it.
  const handleBack = useCallback(() => {
    navigate(`${folderUrl(parentFolderId)}?select=file:${id}`);
  }, [navigate, parentFolderId, id]);

  if (fileQuery.isError) {
    return <EditorErrorState message={errorMessage(fileQuery.error, "load failed")} />;
  }
  if (!loaded) return <EditorLoadingState label="Loading file…" />;

  const meta = loaded.meta;

  // ─── Header actions ───────────────────────────────────────────────
  const rename = async (next: string) => {
    const m = await runRename({ id, name: next });
    if (!m) return false;
    setLoaded((prev) => (prev ? { ...prev, meta: { ...prev.meta, name: m.name } } : prev));
    return true;
  };

  const toggleStar = async () => {
    const next = !starred;
    setStarOverride({ id, starred: next });
    try {
      await items.star([{ type: "file", id }], next);
      qc.invalidateQueries({ queryKey: keys.files.listPrefix() });
      qc.invalidateQueries({ queryKey: keys.folders.all });
    } catch (e) {
      setStarOverride({ id, starred: !next });
      toast.error(errorMessage(e, "could not update star"));
    }
  };

  const download = async (bridge: EditorHeaderBridge) => {
    await bridge.flush();
    window.location.href = files.downloadUrl(id);
  };

  const duplicate = async (bridge: EditorHeaderBridge) => {
    if (!(await bridge.flush())) {
      toast.error("Save your changes before duplicating.");
      return;
    }
    try {
      const res = await items.duplicate([{ type: "file", id }]);
      invalidations.itemsMutated(qc);
      const copy = res.files[0];
      if (!copy) return;
      toast.success(`Duplicated as "${copy.name}".`);
      navigate(`/f/${copy.id}`);
    } catch (e) {
      toast.error(errorMessage(e, "duplicate failed"));
    }
  };

  const trash = async (bridge: EditorHeaderBridge) => {
    // Persist pending edits first so a restore brings them back.
    await bridge.flush();
    const folder = meta.folderId;
    try {
      await items.trash([{ type: "file", id }]);
    } catch (e) {
      toast.error(errorMessage(e, "could not move to Trash"));
      return;
    }
    navigate(folderUrl(folder));
    qc.removeQueries({ queryKey: keys.files.detail(id) });
    invalidations.itemsMutated(qc);
    toast.success(`Moved "${meta.name}" to Trash.`, {
      action: {
        label: "Undo",
        onClick: () => {
          items
            .restore([{ type: "file", id }])
            .then(() => {
              invalidations.itemsMutated(qc);
              toast.success(`Restored "${meta.name}".`);
            })
            .catch((e) => toast.error(errorMessage(e, "restore failed")));
        },
      },
    });
  };

  const renderHeader: RenderEditorHeader = (bridge) => (
    <EditorHeader
      bridge={bridge}
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
      starred={starred}
      onToggleStar={() => void toggleStar()}
      onShare={() => setShareOpen(true)}
      onMove={() => setMoveOpen(true)}
      onDuplicate={() => void duplicate(bridge)}
      onDownload={() => void download(bridge)}
      onEditTags={() => setTagsOpen(true)}
      onTrash={() => void trash(bridge)}
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

  const fileDialogs = (
    <>
      <ShareDialog
        open={shareOpen}
        onOpenChange={setShareOpen}
        targetType="file"
        targetId={id}
        targetName={meta.name}
        targetKind={meta.kind}
      />

      {moveOpen && foldersQuery.data ? (
        <MoveToFolderDialog
          open
          onOpenChange={(o) => {
            if (!o) setMoveOpen(false);
          }}
          folders={foldersQuery.data}
          initialId={meta.folderId}
          title={`Move "${meta.name}"`}
          onSubmit={async (folderId) => {
            const m = await runMove({ id, folderId });
            if (!m) return;
            setLoaded((prev) =>
              prev ? { ...prev, meta: { ...prev.meta, folderId: m.folderId } } : prev,
            );
            setMoveOpen(false);
          }}
        />
      ) : null}

      {tagsOpen && rowQuery.isFetched && tagsQuery.data ? (
        <TagEditDialog
          open
          onOpenChange={(o) => {
            if (!o) setTagsOpen(false);
          }}
          initialTags={fileTags}
          suggestions={tagsQuery.data.map((t) => t.name)}
          title={`Tags for "${meta.name}"`}
          onSave={async (next) => {
            const result = await setTagsMutation.mutateAsync({
              id,
              tags: next,
            });
            return result.tags;
          }}
          onSaved={(next) => {
            setTagsOverride({ id, tags: next });
            toast.success("Tags updated.");
          }}
        />
      ) : null}
    </>
  );

  const common = {
    loaded,
    save,
    saveThumb,
    onThumbSaved,
    reload,
    onReload: (ls: LoadedFile) => setLoaded(ls),
    renderHeader,
  };

  if (meta.kind === "drawio") {
    return (
      <div className="h-dvh w-full overflow-hidden bg-background">
        <DrawioEditor key={editorKey} {...common} />
        {fileDialogs}
      </div>
    );
  }

  if (meta.kind === "static-site") {
    // StaticSiteEditor paints its own <PaperSurface> and owns its own
    // scroll container — the wrapper just sizes to the viewport.
    return (
      <div className="h-dvh w-full">
        <StaticSiteEditor
          loaded={loaded}
          renderHeader={renderHeader}
          onManifestChanged={(_manifest, m) => {
            // Keep the editor's `LoadedFile` mirror in sync with the
            // server's bumped version so subsequent mutations send the
            // right `If-Match` header.
            setLoaded((prev) =>
              prev
                ? {
                    ...prev,
                    meta: {
                      ...prev.meta,
                      version: m.version,
                      updatedAt: m.updatedAt,
                      name: m.name,
                    },
                  }
                : prev,
            );
          }}
        />
        {fileDialogs}
      </div>
    );
  }

  if (meta.kind === "notes") {
    return (
      <div className="h-dvh w-full overflow-hidden bg-background">
        <NotesEditor key={editorKey} {...common} />
        {fileDialogs}
      </div>
    );
  }

  return (
    <div className="h-dvh w-full overflow-hidden bg-background">
      <ExcalidrawEditor
        key={editorKey}
        {...common}
        chrome={
          <MainMenu>
            {/* File-level actions (rename, tags, share, download…) live
                in the EditorHeader; the relocated MainMenu keeps only
                canvas-level items. */}
            <MainMenu.DefaultItems.SaveAsImage />
            <MainMenu.Separator />
            {/* Native three-state theme item (light / dark / system). */}
            <MainMenu.DefaultItems.ToggleTheme
              allowSystemTheme
              theme={themeMode}
              onSelect={setThemeMode}
            />
            <MainMenu.DefaultItems.ClearCanvas />
            <MainMenu.DefaultItems.Help />
          </MainMenu>
        }
      />
      {fileDialogs}
    </div>
  );
}
