import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ApiError, LoadedScene, SceneBlob, scenes, shares } from "../api";
import SceneEditor from "../components/SceneEditor";

export default function Editor() {
  const { id = "" } = useParams<{ id: string }>();
  const [loaded, setLoaded] = useState<LoadedScene | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);

  // Initial load. Re-runs if `id` changes (navigating between scenes).
  const reload = useCallback(async () => {
    const ls = await scenes.load(id);
    setLoaded(ls);
    return ls;
  }, [id]);

  useEffect(() => {
    setLoaded(null);
    setErr(null);
    reload().catch((e) => setErr(e instanceof ApiError ? e.message : "load failed"));
  }, [reload]);

  const save = useCallback(
    async (version: number, blob: SceneBlob) => {
      const m = await scenes.save(id, version, blob);
      // Reflect new name (if appState.name changed) and version locally.
      setLoaded((prev) => (prev ? { ...prev, meta: { ...prev.meta, name: m.name, version: m.version, updatedAt: m.updatedAt } } : prev));
      return { version: m.version };
    },
    [id]
  );

  const saveThumb = useCallback((svg: string) => scenes.putThumb(id, svg), [id]);

  async function rename() {
    if (!loaded) return;
    const next = prompt("Rename scene", loaded.meta.name);
    if (!next || next === loaded.meta.name) return;
    try {
      const m = await scenes.rename(id, next);
      setLoaded({ ...loaded, meta: { ...loaded.meta, name: m.name } });
    } catch (e) {
      alert(e instanceof ApiError ? e.message : "rename failed");
    } finally {
      setRenaming(false);
    }
  }

  async function createShare(permission: "read" | "write") {
    try {
      const t = await shares.create(id, permission);
      const url = `${location.origin}/share/${t.token}`;
      setShareUrl(url);
      try {
        await navigator.clipboard.writeText(url);
      } catch {
        /* clipboard may be denied; URL is still shown */
      }
    } catch (e) {
      alert(e instanceof ApiError ? e.message : "share failed");
    }
  }

  if (err) {
    return (
      <div className="editor-error">
        <p>{err}</p>
        <Link to="/">Back to dashboard</Link>
      </div>
    );
  }

  if (!loaded) {
    return <div className="editor-loading">Loading scene…</div>;
  }

  return (
    <div className="editor-page">
      <header className="editor-header">
        <Link to="/" className="editor-back" aria-label="Back to dashboard">←</Link>
        <button className="editor-name" onClick={rename} title="Click to rename">
          {loaded.meta.name}
        </button>
        <div className="editor-actions">
          <button onClick={() => createShare("read")} title="Create read-only link">Share view</button>
          <button onClick={() => createShare("write")} title="Create editable link">Share edit</button>
        </div>
      </header>
      {shareUrl && (
        <div className="editor-share-toast">
          Link copied: <code>{shareUrl}</code>
          <button onClick={() => setShareUrl(null)}>×</button>
        </div>
      )}
      <SceneEditor
        loaded={loaded}
        save={save}
        saveThumb={saveThumb}
        reload={reload}
        onReload={(ls) => setLoaded(ls)}
      />
      {/* keep `renaming` referenced to satisfy noUnusedLocals */}
      {renaming ? null : null}
    </div>
  );
}
