import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { ApiError, LoadedScene, SceneBlob, shares } from "../api";
import SceneEditor from "../components/SceneEditor";

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
          ? { ...prev, meta: { ...prev.meta, name: m.name, version: m.version, updatedAt: m.updatedAt } }
          : prev
      );
      return { version: m.version };
    },
    [token]
  );

  if (err) return <div className="editor-error"><p>{err}</p></div>;
  if (!loaded) return <div className="editor-loading">Loading shared scene…</div>;

  const writable = loaded.permission === "write";

  return (
    <div className="editor-page">
      <header className="editor-header">
        <span className="editor-name editor-name-static" title={loaded.meta.name}>
          {loaded.meta.name}
        </span>
        <span className={`editor-badge ${writable ? "editor-badge-edit" : "editor-badge-view"}`}>
          {writable ? "Shared • can edit" : "Shared • view only"}
        </span>
      </header>
      <SceneEditor
        loaded={loaded}
        save={writable ? save : (async () => ({ version: loaded.meta.version }))}
        saveThumb={null}
        reload={reload}
        onReload={(ls) => setLoaded(ls)}
      />
    </div>
  );
}
