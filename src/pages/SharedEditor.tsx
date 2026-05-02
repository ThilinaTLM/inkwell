// SharedEditor handles both forms of share token:
//   /share/:token                  → scene-share (loads /api/share/:token)
//   /share/:token/scenes/:sceneId  → folder-share scene (loads /api/share/:token/scenes/:sceneId)
//
// Like Editor, this is a zero-chrome canvas page. All controls live inside
// Excalidraw's MainMenu / Footer. We expose a reduced action set:
//   • Back to folder (only on folder-share scene routes)
//   • Download (only when the share grants downloads)
//   • Default Excalidraw items (theme, save-as-image, help)
// Read-only shares get the canvas in view mode; writeable shares get the
// save-status footer pill, but no rename/share-from-share since the visitor
// doesn't own the scene.

import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { MainMenu, Footer } from "@excalidraw/excalidraw";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  ArrowLeft01Icon,
  Download01Icon,
  EyeIcon,
  PencilEdit02Icon,
} from "@hugeicons/core-free-icons";

import type { LoadedScene, SceneBlob } from "@/api";
import { ApiError, shares } from "@/api";
import SceneEditor, { EditorSaveBadge } from "@/components/SceneEditor";
import { SceneNameLabel } from "@/components/sketch";
import { EditorErrorState, EditorLoadingState } from "./Editor";

interface SharedEditorProps {
  /** Optional preloaded scene; used by SharedTokenLanding to avoid a double fetch. */
  preloaded?: LoadedScene;
}

export default function SharedEditor({ preloaded }: SharedEditorProps = {}) {
  const params = useParams<{ token: string; sceneId?: string }>();
  const navigate = useNavigate();
  const token = params.token || "";
  const sceneId = params.sceneId; // present only on folder-share routes

  const [loaded, setLoaded] = useState<LoadedScene | null>(preloaded ?? null);
  const [err, setErr] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const ls = sceneId
      ? await shares.loadFolderScene(token, sceneId)
      : await shares.load(token);
    setLoaded(ls);
    return ls;
  }, [token, sceneId]);

  useEffect(() => {
    if (preloaded) {
      setLoaded(preloaded);
      return;
    }
    setLoaded(null);
    setErr(null);
    reload().catch((e) =>
      setErr(e instanceof ApiError ? e.message : "could not load shared scene")
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reload, preloaded]);

  const save = useCallback(
    async (version: number, blob: SceneBlob) => {
      const m = sceneId
        ? await shares.saveFolderScene(token, sceneId, version, blob)
        : await shares.save(token, version, blob);
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
          : prev
      );
      return { version: m.version };
    },
    [token, sceneId]
  );

  if (err) return <EditorErrorState message={err} />;
  if (!loaded) return <EditorLoadingState label="Loading shared scene…" />;

  const writable = loaded.permission === "write";
  const downloadHref = sceneId
    ? shares.folderSceneDownloadUrl(token, sceneId)
    : shares.downloadUrl(token);

  return (
    <div className="h-dvh w-dvw bg-paper">
      <SceneEditor
        loaded={loaded}
        save={writable ? save : async () => ({ version: loaded.meta.version })}
        saveThumb={null}
        reload={reload}
        onReload={(ls) => setLoaded(ls)}
        chrome={
          <>
            <MainMenu>
              {/* Header showing scene name + share permission. Excalidraw
                  owns the actual hamburger trigger; we surface document
                  context inside the menu and via <Footer>. */}
              <MainMenu.ItemCustom>
                <div className="flex flex-col gap-0.5 px-2 pb-2 pt-1">
                  <span
                    className="truncate font-heading text-base text-ink"
                    title={loaded.meta.name}
                  >
                    {loaded.meta.name}
                  </span>
                  <span className="flex items-center gap-1 font-hand text-xs text-ink-muted">
                    {writable ? (
                      <>
                        <HugeiconsIcon
                          icon={PencilEdit02Icon}
                          strokeWidth={1.8}
                          className="size-3"
                        />
                        Shared · can edit
                      </>
                    ) : (
                      <>
                        <HugeiconsIcon
                          icon={EyeIcon}
                          strokeWidth={1.8}
                          className="size-3"
                        />
                        Shared · view only
                      </>
                    )}
                  </span>
                </div>
              </MainMenu.ItemCustom>
              <MainMenu.Separator />

              {sceneId && (
                <MainMenu.Item
                  icon={
                    <HugeiconsIcon icon={ArrowLeft01Icon} strokeWidth={1.8} />
                  }
                  onSelect={() => navigate(`/share/${token}`)}
                >
                  Back to folder
                </MainMenu.Item>
              )}
              {loaded.allowDownload && (
                <MainMenu.ItemLink
                  href={downloadHref}
                  icon={
                    <HugeiconsIcon icon={Download01Icon} strokeWidth={1.8} />
                  }
                >
                  Download .excalidraw
                </MainMenu.ItemLink>
              )}

              <MainMenu.Separator />
              <MainMenu.DefaultItems.ToggleTheme />
              <MainMenu.DefaultItems.SaveAsImage />
              <MainMenu.DefaultItems.Help />
            </MainMenu>

            <Footer>
              <SceneNameLabel name={loaded.meta.name} />
              {writable && <EditorSaveBadge />}
            </Footer>
          </>
        }
      />
    </div>
  );
}
