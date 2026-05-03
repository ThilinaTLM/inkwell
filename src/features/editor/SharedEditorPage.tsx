// SharedEditor handles both forms of share token:
//   /share/:token                  → scene-share (loads /api/share/:token)
//   /share/:token/scenes/:sceneId  → folder-share scene (loads /api/share/:token/scenes/:sceneId)
//
// Like Editor, this is a zero-chrome canvas page. Scene name + save / read-only
// status are rendered in the patched-in top-left slot via SceneEditor's
// internal `renderTopLeftUI` wiring (see `SceneTopLeftStrip`). The dedicated
// back icon button in that strip handles "back to folder" on folder-share
// scene routes; on a top-level scene-share token there's no parent and the
// back button is hidden. The MainMenu hamburger (relocated to the top-right
// next to Library by our Excalidraw patch) surfaces a reduced action set:
//   • Share-permission sub-label ("Shared · can edit" / "Shared · view only")
//   • Download (only when the share grants downloads)
//   • Default Excalidraw items (theme, save-as-image, help)
// Read-only shares get the canvas in view mode; the top-left strip surfaces
// the read-only state via the EyeIcon variant. Visitors never see
// rename/share-from-share since they don't own the scene.

import { MainMenu } from "@excalidraw/excalidraw";
import { Download01Icon, EyeIcon, PencilEdit02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useSharedScene } from "@/features/editor/hooks";
import SceneEditor from "@/features/editor/SceneEditor";
import type { LoadedScene, SceneBlob } from "@/lib/api/client";
import { shares } from "@/lib/api/client";
import { keys } from "@/lib/api/query-keys";
import { errorMessage } from "@/lib/errors";
import { useTheme } from "@/lib/theme";
import { EditorErrorState, EditorLoadingState } from "./EditorChrome";

interface SharedEditorProps {
  /** Optional preloaded scene; used by SharedTokenLanding to avoid a double fetch. */
  preloaded?: LoadedScene;
}

export default function SharedEditorPage({ preloaded }: SharedEditorProps = {}) {
  const params = useParams<{ token: string; sceneId?: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const token = params.token || "";
  const sceneId = params.sceneId; // present only on folder-share routes

  // Skip the network when the parent page already resolved the scene.
  const sceneQuery = useSharedScene(preloaded ? "" : token, sceneId);

  const [loaded, setLoaded] = useState<LoadedScene | null>(preloaded ?? null);
  const { mode: themeMode, setMode: setThemeMode } = useTheme();

  // Seed working copy on first arrival; thereafter the editor owns it.
  useEffect(() => {
    if (loaded) return;
    if (sceneQuery.data) setLoaded(sceneQuery.data);
  }, [sceneQuery.data, loaded]);

  // Force-fresh reload after a 409 conflict.
  const reload = useCallback(async () => {
    const ls = await qc.fetchQuery({
      queryKey: keys.publicShare.token(token, sceneId),
      queryFn: () => (sceneId ? shares.loadFolderScene(token, sceneId) : shares.load(token)),
      staleTime: 0,
    });
    setLoaded(ls);
    return ls;
  }, [qc, token, sceneId]);

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
          : prev,
      );
      return { version: m.version };
    },
    [token, sceneId],
  );

  if (sceneQuery.isError) {
    return (
      <EditorErrorState message={errorMessage(sceneQuery.error, "could not load shared scene")} />
    );
  }
  if (!loaded) return <EditorLoadingState label="Loading shared scene…" />;

  const writable = loaded.permission === "write";
  const downloadHref = sceneId
    ? shares.folderSceneDownloadUrl(token, sceneId)
    : shares.downloadUrl(token);

  return (
    <div className="h-dvh w-dvw bg-background">
      <SceneEditor
        loaded={loaded}
        save={writable ? save : async () => ({ version: loaded.meta.version })}
        saveThumb={null}
        reload={reload}
        onReload={(ls) => setLoaded(ls)}
        back={
          sceneId ? { onClick: () => navigate(`/share/${token}`), label: "Back to folder" } : null
        }
        chrome={
          <MainMenu>
            {/* Scene name + save status / read-only state render in the
                top-left strip. Here we keep just the share-permission
                line, which clarifies the *source* of any "Read-only"
                indicator users see in that strip. */}
            <MainMenu.ItemCustom>
              <div className="px-2 pb-2 pt-1">
                <span className="flex items-center gap-1 text-xs text-muted-foreground/70">
                  {writable ? (
                    <>
                      <HugeiconsIcon icon={PencilEdit02Icon} strokeWidth={1.8} className="size-3" />
                      Shared · can edit
                    </>
                  ) : (
                    <>
                      <HugeiconsIcon icon={EyeIcon} strokeWidth={1.8} className="size-3" />
                      Shared · view only
                    </>
                  )}
                </span>
              </div>
            </MainMenu.ItemCustom>
            <MainMenu.Separator />

            {/* "Back to folder" is now exposed as the dedicated back icon
                button in the top-left strip, so we don't duplicate it as a
                menu entry. */}
            {loaded.allowDownload && (
              <MainMenu.ItemLink
                href={downloadHref}
                icon={<HugeiconsIcon icon={Download01Icon} strokeWidth={1.8} />}
              >
                Download .excalidraw
              </MainMenu.ItemLink>
            )}

            <MainMenu.Separator />
            <MainMenu.DefaultItems.ToggleTheme
              allowSystemTheme
              theme={themeMode}
              onSelect={setThemeMode}
            />
            <MainMenu.DefaultItems.SaveAsImage />
            <MainMenu.DefaultItems.Help />
          </MainMenu>
        }
      />
    </div>
  );
}
