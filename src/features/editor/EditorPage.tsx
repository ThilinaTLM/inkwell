// Editor — the canvas page.
//
// The editor "owns" the working scene copy after first arrival:
// `useScene(id)` is configured with `staleTime: Infinity` so it never
// refetches and clobbers unsaved edits. We seed local state from the
// query result on first arrival, then subsequent saves write back to
// both the cache (`setQueryData`) and the local state.
//
// Save remains a plain closure (NOT `useMutation`): SceneEditor's
// autosave loop has its own dedup ref and 409-reload-and-reset
// semantics that don't compose cleanly with a mutation lifecycle.

import { MainMenu } from "@excalidraw/excalidraw";
import { Download01Icon, Edit02Icon, HashtagIcon, Share08Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useNavigationType, useParams } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useScene } from "@/features/editor/hooks";
import { useRenameScene, useSetSceneTags, useTags } from "@/features/explorer/hooks";
import { ShareDialog } from "@/features/sharing/ShareDialog";
import { TagEditDialog } from "@/features/tags/TagEditDialog";
import { type LoadedScene, type SceneBlob, type SceneMeta, scenes } from "@/lib/api/client";
import { keys } from "@/lib/api/query-keys";
import { errorMessage } from "@/lib/errors";
import { useTheme } from "@/lib/theme";
import DrawioEditor from "./DrawioEditor";
import { EditorErrorState, EditorLoadingState } from "./EditorChrome";
import { RenameSceneDialog } from "./RenameSceneDialog";
import SceneEditor from "./SceneEditor";

export default function EditorPage() {
  const { id = "" } = useParams<{ id: string }>();
  const qc = useQueryClient();

  const sceneQuery = useScene(id);
  const tagsQuery = useTags();
  const renameMutation = useRenameScene();
  const setTagsMutation = useSetSceneTags();

  const navigate = useNavigate();
  const navType = useNavigationType();
  const [loaded, setLoaded] = useState<LoadedScene | null>(null);
  const [renameOpen, setRenameOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [tagsOpen, setTagsOpen] = useState(false);
  // `mode`/`setMode` (rather than `resolved`/`toggle`) so the native
  // `MainMenu.DefaultItems.ToggleTheme` can render the three-state
  // light/dark/system picker our provider already supports.
  const { mode: themeMode, setMode: setThemeMode } = useTheme();

  // Seed the working copy on first arrival. After that the editor owns
  // it; we do NOT mirror further query updates here because that would
  // overwrite unsaved edits.
  useEffect(() => {
    if (loaded) return;
    if (sceneQuery.data) setLoaded(sceneQuery.data);
  }, [sceneQuery.data, loaded]);

  // When navigating to a *different* scene, reset the working copy so the
  // seed effect above re-runs against the new query data.
  //
  // Gated on a real id transition via a ref: on the initial mount React
  // would otherwise fire this effect alongside the seed effect in the same
  // commit, and `setLoaded(null)` would clobber `setLoaded(data)` whenever
  // the query cache is already warm (e.g. user opens a scene, goes back,
  // opens it again). With a cold cache the original code worked by
  // accident — `sceneQuery.data` was undefined on the initial commit so
  // the seed effect was a no-op and only ran later when data arrived.
  const prevIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (prevIdRef.current !== null && prevIdRef.current !== id) {
      setLoaded(null);
    }
    prevIdRef.current = id;
  }, [id]);

  // Reload after a 409 conflict: bypass cache and force a fresh fetch.
  const reload = useCallback(async () => {
    const ls = await qc.fetchQuery({
      queryKey: keys.scenes.detail(id),
      queryFn: () => scenes.load(id),
      staleTime: 0,
    });
    setLoaded(ls);
    return ls;
  }, [qc, id]);

  // Save: throws ApiError(409) on version conflict so SceneEditor's
  // autosave loop can react. On success update both local state and the
  // cached scene detail row so revisiting this editor doesn't resurrect
  // an old version from React Query's staleTime/gcTime Infinity cache.
  const save = useCallback(
    async (version: number, blob: SceneBlob) => {
      const m = await scenes.save(id, version, blob);
      const nextLoaded: LoadedScene = {
        meta: {
          id,
          name: m.name,
          kind: m.kind,
          version: m.version,
          updatedAt: m.updatedAt,
          folderId: loaded?.meta.folderId ?? null,
        },
        blob,
        permission: "write",
        allowDownload: true,
      };
      setLoaded(nextLoaded);
      qc.setQueryData(keys.scenes.detail(id), nextLoaded);
      // Update cached scene-list rows so explorer views show fresh data.
      // Scope to list queries only — invalidating `keys.scenes.all` would
      // also match `keys.scenes.detail(id)` (prefix match) and trigger a
      // refetch of the active scene on every save, racing the autosave loop.
      qc.invalidateQueries({ queryKey: ["scenes", "list"] });
      return { version: m.version };
    },
    [id, loaded?.meta.folderId, qc],
  );

  const saveThumb = useCallback((svg: string) => scenes.putThumb(id, svg), [id]);

  // After a thumb upload, the server's `thumb_updated_at` advances. The
  // explorer cards build their `<img src>` from `SceneMeta.thumbUpdatedAt`
  // (and `FolderMeta.previews[].thumbUpdatedAt`), so we need both queries
  // to refetch for the new bust token to propagate. Doing it here —
  // rather than inside SceneEditor — keeps the editor unaware of the
  // explorer's query taxonomy.
  const onThumbSaved = useCallback(() => {
    qc.invalidateQueries({ queryKey: ["scenes", "list"] });
    qc.invalidateQueries({ queryKey: ["folders", "list"] });
  }, [qc]);

  // Lazy tag-set lookup: when the user opens "Edit tags" we need this
  // scene's current tags. The LoadedScene meta doesn't include them, so
  // we read out of any cached scene-list result first; fall back to a
  // one-shot list fetch if the cache is empty. Crucially: we never
  // refetch the whole-account scene list per dialog-open.
  const sceneTags = useSceneTagsLazy(id, tagsOpen);

  // History-aware "Back to dashboard":
  //   - PUSH (we got here via in-app navigation) → real browser back, so
  //     the user lands in whatever section/folder they came from.
  //   - Anything else (cold deep-link, refresh, forward-then-back) → fall
  //     back to the scene's actual parent folder (server truth from
  //     `LoadedScene.meta.folderId`), or root if the scene is at root.
  const parentFolderId = loaded?.meta.folderId ?? null;
  const handleBack = useCallback(() => {
    if (navType === "PUSH") {
      navigate(-1);
    } else {
      navigate(parentFolderId ? `/folders/${parentFolderId}` : "/", { replace: true });
    }
  }, [navType, parentFolderId, navigate]);

  if (sceneQuery.isError) {
    return <EditorErrorState message={errorMessage(sceneQuery.error, "load failed")} />;
  }
  if (!loaded) return <EditorLoadingState label="Loading scene…" />;

  const sceneDialogs = (
    <>
      <RenameSceneDialog
        open={renameOpen}
        onOpenChange={setRenameOpen}
        currentName={loaded.meta.name}
        onRename={async (next) => {
          try {
            const m = await renameMutation.mutateAsync({ id, name: next });
            setLoaded((prev) => (prev ? { ...prev, meta: { ...prev.meta, name: m.name } } : prev));
            toast.success(`Renamed to "${m.name}".`);
            setRenameOpen(false);
          } catch (e) {
            toast.error(errorMessage(e, "rename failed"));
          }
        }}
      />

      <ShareDialog
        open={shareOpen}
        onOpenChange={setShareOpen}
        targetType="scene"
        targetId={id}
        targetName={loaded.meta.name}
      />

      {tagsOpen && sceneTags.status === "ok" && tagsQuery.data ? (
        <TagEditDialog
          open
          onOpenChange={(o) => {
            if (!o) setTagsOpen(false);
          }}
          initialTags={sceneTags.tags}
          suggestions={tagsQuery.data.map((t) => t.name)}
          title={`Tags for "${loaded.meta.name}"`}
          onSave={async (next) => {
            const result = await setTagsMutation.mutateAsync({
              id,
              tags: next,
            });
            return result.tags;
          }}
          onSaved={(next) => {
            sceneTags.write(next);
            toast.success("Tags updated.");
          }}
        />
      ) : null}
    </>
  );

  if (loaded.meta.kind === "drawio") {
    return (
      <div className="h-dvh w-dvw bg-background">
        <DrawioEditor
          loaded={loaded}
          save={save}
          reload={reload}
          onReload={(ls) => setLoaded(ls)}
          back={{ onClick: handleBack, label: "Back" }}
          onRequestRename={() => setRenameOpen(true)}
          actions={
            <>
              <Button type="button" variant="ghost" size="sm" onClick={() => setTagsOpen(true)}>
                Tags
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => setShareOpen(true)}>
                Share
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  window.location.href = scenes.downloadUrl(id);
                }}
              >
                Download .drawio
              </Button>
            </>
          }
        />
        {sceneDialogs}
      </div>
    );
  }

  return (
    <div className="h-dvh w-dvw bg-background">
      <SceneEditor
        loaded={loaded}
        save={save}
        saveThumb={saveThumb}
        onThumbSaved={onThumbSaved}
        reload={reload}
        onReload={(ls) => setLoaded(ls)}
        back={{ onClick: handleBack, label: "Back to dashboard" }}
        onRequestRename={() => setRenameOpen(true)}
        chrome={
          <MainMenu>
            {/* The MainMenu trigger is relocated to the top-right via our
                Excalidraw patch (see SceneEditor.tsx header). The back
                button is provided by the dedicated icon button in the
                top-left strip, so it's no longer duplicated here. */}
            <MainMenu.Item
              icon={<HugeiconsIcon icon={Edit02Icon} strokeWidth={1.8} />}
              onSelect={() => setRenameOpen(true)}
            >
              Rename…
            </MainMenu.Item>
            <MainMenu.Item
              icon={<HugeiconsIcon icon={HashtagIcon} strokeWidth={1.8} />}
              onSelect={() => setTagsOpen(true)}
            >
              Edit tags…
            </MainMenu.Item>
            <MainMenu.Item
              icon={<HugeiconsIcon icon={Share08Icon} strokeWidth={1.8} />}
              onSelect={() => setShareOpen(true)}
            >
              Share…
            </MainMenu.Item>
            <MainMenu.ItemLink
              href={scenes.downloadUrl(id)}
              icon={<HugeiconsIcon icon={Download01Icon} strokeWidth={1.8} />}
            >
              Download .excalidraw
            </MainMenu.ItemLink>
            <MainMenu.DefaultItems.SaveAsImage />
            <MainMenu.Separator />
            {/* Native three-state theme item (light / dark / system).
                Replaces the previous custom 2-state toggle and unlocks
                the "system" preference our useTheme already models. */}
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

      {sceneDialogs}
    </div>
  );
}

/**
 * Read the current scene's tags without paying for a whole-account
 * scene-list refetch. Three states:
 *   - "idle"     dialog hasn't opened yet → don't fetch
 *   - "loading"  dialog opened, no cache hit → one-shot list fetch in flight
 *   - "ok"       tags are known
 *
 * `write` mirrors the latest tags so the dialog stays in sync after the
 * user saves.
 */
function useSceneTagsLazy(
  id: string,
  enabled: boolean,
):
  | { status: "idle" }
  | { status: "loading" }
  | {
      status: "ok";
      tags: string[];
      write: (next: string[]) => void;
    } {
  const qc = useQueryClient();
  const [tagState, setTagState] = useState<{ id: string; tags: string[] | null }>({
    id,
    tags: null,
  });
  const tags = tagState.id === id ? tagState.tags : null;

  useEffect(() => {
    setTagState((prev) => (prev.id === id ? prev : { id, tags: null }));
  }, [id]);

  useEffect(() => {
    if (!enabled || tags !== null) return;

    // 1) Check every cached scenes.list query for this id.
    const lists = qc.getQueriesData<SceneMeta[]>({
      queryKey: keys.scenes.listPrefix(),
    });
    for (const [, rows] of lists) {
      if (!Array.isArray(rows)) continue;
      const hit = rows.find((r) => r.id === id);
      if (hit) {
        setTagState({ id, tags: hit.tags });
        return;
      }
    }

    // 2) Cache miss. Do a one-shot list and cache it under the
    //    canonical scenes.list key so future opens hit the cache.
    let alive = true;
    qc.fetchQuery({
      queryKey: keys.scenes.list({}),
      queryFn: () => scenes.list({}),
    })
      .then((rows) => {
        if (!alive) return;
        const hit = rows.find((r) => r.id === id);
        setTagState({ id, tags: hit?.tags ?? [] });
      })
      .catch(() => {
        if (alive) setTagState({ id, tags: [] });
      });
    return () => {
      alive = false;
    };
  }, [enabled, id, qc, tags]);

  if (!enabled && tags === null) return { status: "idle" };
  if (tags === null) return { status: "loading" };
  return {
    status: "ok",
    tags,
    write: (next) => setTagState({ id, tags: next }),
  };
}
