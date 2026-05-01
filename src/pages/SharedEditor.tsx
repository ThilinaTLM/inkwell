import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { HugeiconsIcon } from "@hugeicons/react";
import { EyeIcon, PencilEdit02Icon } from "@hugeicons/core-free-icons";

import { ApiError, LoadedScene, SceneBlob, shares } from "@/api";
import SceneEditor from "@/components/SceneEditor";
import { Badge } from "@/components/ui/badge";
import {
  EditorErrorState,
  EditorHeader,
  EditorLoadingState,
} from "./Editor";

export default function SharedEditor() {
  const { token = "" } = useParams<{ token: string }>();
  const [loaded, setLoaded] = useState<LoadedScene | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const ls = await shares.load(token);
    setLoaded(ls);
    return ls;
  }, [token]);

  useEffect(() => {
    setLoaded(null);
    setErr(null);
    reload().catch((e) =>
      setErr(e instanceof ApiError ? e.message : "could not load shared scene")
    );
  }, [reload]);

  const save = useCallback(
    async (version: number, blob: SceneBlob) => {
      const m = await shares.save(token, version, blob);
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
    [token]
  );

  if (err) return <EditorErrorState message={err} />;
  if (!loaded) return <EditorLoadingState label="Loading shared scene…" />;

  const writable = loaded.permission === "write";

  return (
    <div className="flex h-dvh flex-col bg-background text-foreground">
      <EditorHeader
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
      />
      <div className="flex-1 min-h-0">
        <SceneEditor
          loaded={loaded}
          save={
            writable ? save : async () => ({ version: loaded.meta.version })
          }
          saveThumb={null}
          reload={reload}
          onReload={(ls) => setLoaded(ls)}
        />
      </div>
    </div>
  );
}
