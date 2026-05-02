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

import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { MainMenu } from "@excalidraw/excalidraw";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Download01Icon,
  Edit02Icon,
  HashtagIcon,
  Share08Icon,
} from "@hugeicons/core-free-icons";
import { toast } from "sonner";

import {
  scenes,
  type LoadedScene,
  type SceneBlob,
  type SceneMeta,
} from "@/lib/api/client";
import { keys } from "@/lib/api/query-keys";
import { SceneNameLabel } from "@/components/sketch";
import { useScene } from "@/features/editor/hooks";
import {
  useRenameScene,
  useSetSceneTags,
  useTags,
} from "@/features/explorer/hooks";
import { ShareDialog } from "@/features/sharing/ShareDialog";
import { TagEditDialog } from "@/features/tags/TagEditDialog";
import { errorMessage } from "@/lib/errors";
import SceneEditor, { EditorSaveBadge } from "./SceneEditor";
import {
  BackToScenesButton,
  EditorErrorState,
  EditorLoadingState,
} from "./EditorChrome";
import { RenameSceneDialog } from "./RenameSceneDialog";

export default function EditorPage() {
  const { id = "" } = useParams<{ id: string }>();
  const qc = useQueryClient();

  const sceneQuery = useScene(id);
  const tagsQuery = useTags();
  const renameMutation = useRenameScene();
  const setTagsMutation = useSetSceneTags();

  const [loaded, setLoaded] = useState<LoadedScene | null>(null);
  const [renameOpen, setRenameOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [tagsOpen, setTagsOpen] = useState(false);

  // Seed the working copy on first arrival. After that the editor owns
  // it; we do NOT mirror further query updates here because that would
  // overwrite unsaved edits.
  useEffect(() => {
    if (loaded) return;
    if (sceneQuery.data) setLoaded(sceneQuery.data);
  }, [sceneQuery.data, loaded]);

  // When navigating to a different scene, reset the working copy.
  useEffect(() => {
    setLoaded(null);
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
  // scene-list caches so the dashboard sees the new version/updatedAt.
  const save = useCallback(
    async (version: number, blob: SceneBlob) => {
      const m = await scenes.save(id, version, blob);
      setLoaded((prev) =>
        prev
          ? {
              ...prev,
              meta: {
                ...prev.meta,
                name: m.name,
                version: m.version,
                updatedAt: m.updatedAt,
              },
            }
          : prev,
      );
      // Update cached scene-list rows so explorer views show fresh data.
      qc.invalidateQueries({ queryKey: keys.scenes.all });
      return { version: m.version };
    },
    [id, qc],
  );

  const saveThumb = useCallback(
    (svg: string) => scenes.putThumb(id, svg),
    [id],
  );

  // Lazy tag-set lookup: when the user opens "Edit tags" we need this
  // scene's current tags. The LoadedScene meta doesn't include them, so
  // we read out of any cached scene-list result first; fall back to a
  // one-shot list fetch if the cache is empty. Crucially: we never
  // refetch the whole-account scene list per dialog-open.
  const sceneTags = useSceneTagsLazy(id, tagsOpen);

  if (sceneQuery.isError) {
    return (
      <EditorErrorState
        message={errorMessage(sceneQuery.error, "load failed")}
      />
    );
  }
  if (!loaded) return <EditorLoadingState label="Loading scene…" />;

  return (
    <div className="h-dvh w-dvw bg-paper">
      <SceneEditor
        loaded={loaded}
        save={save}
        saveThumb={saveThumb}
        reload={reload}
        onReload={(ls) => setLoaded(ls)}
        topLeftChrome={
          <>
            <BackToScenesButton />
            <SceneNameLabel name={loaded.meta.name} />
          </>
        }
        topRightChrome={<EditorSaveBadge />}
        chrome={
          <MainMenu>
            {/* Excalidraw owns the actual MainMenu trigger (a hamburger
                icon at top-left) and ignores any custom <MainMenu.Trigger>.
                The scene name lives in `topLeftChrome` next to the trigger,
                so we don't duplicate it here. */}
            <MainMenu.Item
              icon={<HugeiconsIcon icon={Edit02Icon} strokeWidth={1.8} />}
              onSelect={() => setRenameOpen(true)}
            >
              Rename…
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
            <MainMenu.Item
              icon={<HugeiconsIcon icon={HashtagIcon} strokeWidth={1.8} />}
              onSelect={() => setTagsOpen(true)}
            >
              Edit tags…
            </MainMenu.Item>
            <MainMenu.Separator />
            <MainMenu.DefaultItems.ToggleTheme />
            <MainMenu.DefaultItems.SaveAsImage />
            <MainMenu.DefaultItems.ClearCanvas />
            <MainMenu.DefaultItems.Help />
          </MainMenu>
        }
      />

      <RenameSceneDialog
        open={renameOpen}
        onOpenChange={setRenameOpen}
        currentName={loaded.meta.name}
        onRename={async (next) => {
          try {
            const m = await renameMutation.mutateAsync({ id, name: next });
            setLoaded((prev) =>
              prev ? { ...prev, meta: { ...prev.meta, name: m.name } } : prev,
            );
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
): { status: "idle" } | { status: "loading" } | {
  status: "ok";
  tags: string[];
  write: (next: string[]) => void;
} {
  const qc = useQueryClient();
  const [tags, setTags] = useState<string[] | null>(null);

  useEffect(() => {
    if (!enabled || tags !== null) return;

    // 1) Check every cached scenes.list query for this id.
    const lists = qc.getQueriesData<SceneMeta[]>({
      queryKey: keys.scenes.all,
    });
    for (const [, rows] of lists) {
      const hit = rows?.find((r) => r.id === id);
      if (hit) {
        setTags(hit.tags);
        return;
      }
    }

    // 2) Cache miss. Do a one-shot list and cache it under the
    //    canonical "all scenes" key so future opens hit the cache.
    let alive = true;
    qc.fetchQuery({
      queryKey: keys.scenes.list({}),
      queryFn: () => scenes.list({}),
    })
      .then((rows) => {
        if (!alive) return;
        const hit = rows.find((r) => r.id === id);
        setTags(hit?.tags ?? []);
      })
      .catch(() => {
        if (alive) setTags([]);
      });
    return () => {
      alive = false;
    };
  }, [enabled, id, qc, tags]);

  if (!enabled && tags === null) return { status: "idle" };
  if (tags === null) return { status: "loading" };
  return { status: "ok", tags, write: setTags };
}
