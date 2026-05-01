// SharedEditor handles both forms of share token:
//   /share/:token                  → scene-share (loads /api/share/:token)
//   /share/:token/scenes/:sceneId  → folder-share scene (loads /api/share/:token/scenes/:sceneId)
//
// The first request to /api/share/:token also returns a folder listing
// when the token is a folder share — that case is handled by
// `pages/SharedFolder.tsx`. This component is only mounted when we
// already know we're loading a scene.

import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Download01Icon,
  EyeIcon,
  PencilEdit02Icon,
} from "@hugeicons/core-free-icons";

import type { LoadedScene, SceneBlob } from "@/api";
import { ApiError, shares } from "@/api";
import SceneEditor from "@/components/SceneEditor";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  EditorErrorState,
  EditorHeader,
  EditorLoadingState,
} from "./Editor";

interface SharedEditorProps {
  /** Optional preloaded scene; used by SharedTokenLanding to avoid a double fetch. */
  preloaded?: LoadedScene;
}

export default function SharedEditor({ preloaded }: SharedEditorProps = {}) {
  const params = useParams<{ token: string; sceneId?: string }>();
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
    <div className="flex h-dvh flex-col bg-background text-foreground">
      <EditorHeader
        backHref={sceneId ? `/share/${token}` : undefined}
        backLabel={sceneId ? "Back to folder" : "Back"}
        title={loaded.meta.name}
        badge={
          writable ? (
            <Badge variant="secondary" className="ml-1 gap-1">
              <HugeiconsIcon icon={PencilEdit02Icon} strokeWidth={2} />
              Shared · can edit
            </Badge>
          ) : (
            <Badge variant="outline" className="ml-1 gap-1">
              <HugeiconsIcon icon={EyeIcon} strokeWidth={2} />
              Shared · view only
            </Badge>
          )
        }
        actions={
          loaded.allowDownload ? (
            <Tooltip>
              <TooltipTrigger
                render={
                  <a
                    href={downloadHref}
                    download
                    aria-label="Download .excalidraw"
                    className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  />
                }
              >
                <HugeiconsIcon icon={Download01Icon} strokeWidth={2} className="size-3.5" />
              </TooltipTrigger>
              <TooltipContent>Download</TooltipContent>
            </Tooltip>
          ) : null
        }
      />
      <div className="flex-1 min-h-0">
        <SceneEditor
          loaded={loaded}
          save={writable ? save : async () => ({ version: loaded.meta.version })}
          saveThumb={null}
          reload={reload}
          onReload={(ls) => setLoaded(ls)}
        />
      </div>
    </div>
  );
}


