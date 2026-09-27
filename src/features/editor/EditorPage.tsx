// Editor — the owner's file page.
//
// Layout: `<EditorHeader>` (44px, rendered by each editor through its
// `renderHeader(bridge)` prop so the header sees live save state and
// routes navigation through the editor's leave-confirm guard) above the
// editor surface, which takes the full remaining height.
// `<EditorOverlays>` mounts the shared command palette, shortcut sheet
// and dialog host (editors live outside AppShell) plus the ⌘K keymap.
//
// The editor "owns" the working file copy after first arrival:
// `useFile(id)` is configured with `staleTime: Infinity` so it never
// refetches on its own and clobbers unsaved edits. We seed local state
// from the query result on first arrival, then subsequent saves write
// back to both the cache (`setQueryData`) and the local state. Later
// detail refetches (triggered by the shared item actions' invalidations
// after rename / move / star and their undos) only contribute metadata
// — name, folder, starred — never the blob or version.
//
// Save remains a plain closure (NOT `useMutation`): the editors'
// autosave loop has its own dedup ref and 409-reload-and-reset
// semantics that don't compose cleanly with a mutation lifecycle.
//
// Header actions go through the shared `itemActions` (same dialogs,
// optimistic updates and undo toasts as the explorer).

import { MainMenu } from "@excalidraw/excalidraw";
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
import { useNavigate, useParams } from "react-router-dom";
import { openShortcutSheet } from "@/components/shell/shellStore";
import { useFile } from "@/data/files";
import { itemActions } from "@/features/actions/useItemActions";
import {
  ApiError,
  type FileBlob,
  type FilesQuery,
  files,
  type ItemRef,
  type LoadedFile,
} from "@/lib/api/client";
import { keys } from "@/lib/api/query-keys";
import type { Command } from "@/lib/commands/registry";
import { errorMessage } from "@/lib/errors";
import { useTheme } from "@/lib/theme";
import DrawioEditor from "./DrawioEditor";
import { EditorErrorState, EditorLoadingState } from "./EditorChrome";
import { EditorHeader } from "./EditorHeader";
import { EditorOverlays } from "./EditorOverlays";
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
  const navigate = useNavigate();
  const [loaded, setLoaded] = useState<LoadedFile | null>(null);
  const loadedRef = useRef(loaded);
  loadedRef.current = loaded;
  // Set when the save lifecycle hit a 409 and re-fetched: shows the
  // non-blocking conflict banner in the header.
  const [conflict, setConflict] = useState(false);
  // Bumped by the conflict banner's Reload to remount the editor with
  // the freshly loaded copy.
  const [editorKey, setEditorKey] = useState(0);
  // Optimistic star state until the next detail refetch confirms it.
  const [starOverride, setStarOverride] = useState<{ id: string; starred: boolean } | null>(null);
  // Bumped to start the header's inline rename (palette "Rename", F2).
  const [renameNonce, setRenameNonce] = useState(0);
  // Latest bridge from the mounted editor (flush / requestLeave for
  // palette-driven actions).
  const bridgeRef = useRef<EditorHeaderBridge | null>(null);
  // `mode`/`setMode` (rather than `resolved`/`toggle`) so the native
  // `MainMenu.DefaultItems.ToggleTheme` can render the three-state
  // light/dark/system picker our provider already supports.
  const { mode: themeMode, setMode: setThemeMode } = useTheme();

  // Seed the working copy on first arrival.
  useEffect(() => {
    if (loaded) return;
    if (fileQuery.data) setLoaded(fileQuery.data);
  }, [fileQuery.data, loaded]);

  // Metadata-only mirror of later detail refetches (see file header).
  // If a refetch raced a save and cached an older version than ours,
  // put our newer copy back so a revisit doesn't open stale content.
  useEffect(() => {
    const data = fileQuery.data;
    const cur = loadedRef.current;
    if (!data || !cur || data.meta.id !== cur.meta.id) return;
    if (data.meta.version < cur.meta.version) {
      qc.setQueryData(keys.files.detail(cur.meta.id), cur);
      return;
    }
    const { name, folderId, starredAt } = data.meta;
    setStarOverride(null);
    if (
      name === cur.meta.name &&
      folderId === cur.meta.folderId &&
      starredAt === cur.meta.starredAt
    ) {
      return;
    }
    setLoaded((prev) =>
      prev && prev.meta.id === data.meta.id
        ? { ...prev, meta: { ...prev.meta, name, folderId, starredAt } }
        : prev,
    );
  }, [fileQuery.data, qc]);

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
      setStarOverride(null);
    }
    prevIdRef.current = id;
  }, [id]);

  // Keep the folder listing warm: the shared item actions resolve names,
  // tags and parents from list caches (otherwise they fetch the whole
  // account's file list once).
  const parentFolderId = loaded?.meta.folderId ?? null;
  const listArgs: FilesQuery = { folderId: parentFolderId ?? "root" };
  useQuery({
    queryKey: keys.files.list(listArgs),
    queryFn: () => files.list(listArgs),
    enabled: !!loaded,
  });

  const starred = starOverride?.id === id ? starOverride.starred : loaded?.meta.starredAt != null;

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
      const prev = loadedRef.current;
      const nextLoaded: LoadedFile = {
        meta: {
          id,
          name: m.name,
          kind: m.kind,
          version: m.version,
          updatedAt: m.updatedAt,
          folderId: prev?.meta.folderId ?? null,
          // Once we've saved at least once, the editor's thumb pipeline
          // will have shipped (or is about to ship) a thumb. Server
          // `loadRow` is the source of truth on next cold load.
          hasThumb: prev?.meta.hasThumb ?? false,
          starredAt: prev?.meta.starredAt ?? m.starredAt ?? null,
        },
        blob,
        permission: "write",
        allowDownload: true,
        sharedBy: null,
      };
      setLoaded(nextLoaded);
      qc.setQueryData(keys.files.detail(id), nextLoaded);
      // Update cached file-list rows so explorer views show fresh data.
      // Scope to list queries only — invalidating `keys.files.all` would
      // also match `keys.files.detail(id)` (prefix match) and trigger a
      // refetch of the active file on every save.
      qc.invalidateQueries({ queryKey: ["files", "list"] });
      qc.invalidateQueries({ queryKey: ["folders", "list"] });
      return { version: m.version };
    },
    [id, qc],
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

  // ─── Actions (shared itemActions) ─────────────────────────────────
  const ref = useMemo<ItemRef>(() => ({ type: "file", id }), [id]);
  const flush = useCallback(async () => (bridgeRef.current ? bridgeRef.current.flush() : true), []);

  const toggleStar = useCallback(() => {
    const next = !starred;
    setStarOverride({ id, starred: next });
    // setStar is optimistic in the list caches, toasts with undo and
    // invalidates; the detail refetch then settles `starredAt` here.
    void itemActions.setStar([ref], next).finally(() => {
      qc.invalidateQueries({ queryKey: keys.files.detail(id), exact: true });
    });
  }, [starred, id, ref, qc]);

  const duplicate = useCallback(async () => {
    // Persist pending edits first so the copy includes them.
    if (!(await flush())) return;
    await itemActions.duplicate([ref]);
  }, [flush, ref]);

  const download = useCallback(async () => {
    await flush();
    await itemActions.download([ref]);
  }, [flush, ref]);

  const trash = useCallback(async () => {
    // Persist pending edits first so a restore brings them back.
    await flush();
    const folder = loadedRef.current?.meta.folderId ?? null;
    await itemActions.trash([ref]);
    // `trash` resolves the same way whether it trashed, was cancelled
    // at the confirm prompt, or failed (it toasts on its own). The file
    // endpoint 404s once the file is in Trash — that tells them apart.
    const gone = await files.load(id).then(
      () => false,
      (e) => e instanceof ApiError && e.status === 404,
    );
    if (!gone) return;
    qc.removeQueries({ queryKey: keys.files.detail(id), exact: true });
    navigate(folderUrl(folder));
  }, [flush, ref, id, qc, navigate]);

  const rename = useCallback(
    async (next: string) => {
      try {
        await itemActions.rename(ref, next);
      } catch {
        return false; // itemActions already toasted
      }
      setLoaded((prev) => (prev ? { ...prev, meta: { ...prev.meta, name: next.trim() } } : prev));
      return true;
    },
    [ref],
  );

  // Palette / registry overrides with editor semantics. Only chords the
  // editor actually handles carry `keys` (so the shortcut sheet is
  // honest); single keys belong to the canvas / document.
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
        run: () => void duplicate(),
      },
      {
        id: "item.download",
        icon: Download01Icon,
        label: "Download",
        group: "file",
        run: () => void download(),
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
        run: () => bridgeRef.current?.requestLeave(handleBack) ?? handleBack(),
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

  const overlays = <EditorOverlays file={loaded ? ref : null} overrides={overrides} />;

  // A failed *refetch* keeps the editor (and unsaved work) on screen;
  // only a failed first load shows the error page.
  if (fileQuery.isError && !loaded) {
    return <EditorErrorState message={errorMessage(fileQuery.error, "load failed")} />;
  }
  if (!loaded) return <EditorLoadingState label="Loading file…" />;

  const meta = loaded.meta;

  const renderHeader: RenderEditorHeader = (bridge) => {
    bridgeRef.current = bridge;
    return (
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
        renameNonce={renameNonce}
        starred={starred}
        onToggleStar={toggleStar}
        onShare={() => itemActions.share(ref)}
        onMove={() => itemActions.moveDialog([ref])}
        onDuplicate={() => void duplicate()}
        onDownload={() => void download()}
        onEditTags={() => itemActions.editTags([ref])}
        onTrash={() => void trash()}
        onShowShortcuts={openShortcutSheet}
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
  };

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
        {overlays}
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
        {overlays}
      </div>
    );
  }

  if (meta.kind === "notes") {
    return (
      <div className="h-dvh w-full overflow-hidden bg-background">
        <NotesEditor key={editorKey} {...common} />
        {overlays}
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
      {overlays}
    </div>
  );
}
