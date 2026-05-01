import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ApiError, SceneMeta, auth, scenes } from "../api";

export default function Dashboard({ onLogout }: { onLogout: () => void }) {
  const [items, setItems] = useState<SceneMeta[] | null>(null);
  const [search, setSearch] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const navigate = useNavigate();

  async function refresh() {
    try {
      setItems(await scenes.list());
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "failed to load");
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function createNew() {
    try {
      const m = await scenes.create();
      navigate(`/s/${m.id}`);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "failed to create");
    }
  }

  async function rename(s: SceneMeta) {
    const next = prompt("Rename scene", s.name);
    if (!next || next === s.name) return;
    try {
      await scenes.rename(s.id, next);
      await refresh();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "rename failed");
    }
  }

  async function remove(s: SceneMeta) {
    if (!confirm(`Delete “${s.name}”? This cannot be undone.`)) return;
    try {
      await scenes.delete(s.id);
      setItems((prev) => (prev ? prev.filter((x) => x.id !== s.id) : prev));
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "delete failed");
    }
  }

  async function logout() {
    try {
      await auth.logout();
    } finally {
      onLogout();
      navigate("/login", { replace: true });
    }
  }

  const filtered = useMemo(() => {
    if (!items) return null;
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter((s) => s.name.toLowerCase().includes(q));
  }, [items, search]);

  return (
    <div className="dash">
      <header className="dash-header">
        <Link to="/" className="dash-mark">inkwell</Link>
        <input
          className="dash-search"
          placeholder="Search…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="dash-actions">
          <button className="dash-new" onClick={createNew}>+ New scene</button>
          <button className="dash-logout" onClick={logout}>Sign out</button>
        </div>
      </header>

      {err && <div className="dash-err">{err}</div>}

      {filtered === null ? (
        <div className="dash-empty">Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="dash-empty">
          {items && items.length === 0 ? (
            <>
              No scenes yet.
              <button className="dash-new" onClick={createNew}>Create your first one</button>
            </>
          ) : (
            <>No scenes match “{search}”.</>
          )}
        </div>
      ) : (
        <ul className="grid">
          {filtered.map((s) => (
            <li key={s.id} className="card">
              <Link to={`/s/${s.id}`} className="card-thumb" aria-label={`Open ${s.name}`}>
                {s.hasThumb ? (
                  // Cache-bust on version so renames/edits surface immediately.
                  <img src={`/api/scenes/${s.id}/thumb?v=${s.version}`} alt="" loading="lazy" />
                ) : (
                  <div className="card-thumb-empty">empty</div>
                )}
              </Link>
              <div className="card-row">
                <div className="card-meta">
                  <div className="card-name" title={s.name}>{s.name}</div>
                  <div className="card-sub">{relTime(s.updatedAt)}</div>
                </div>
                <div className="card-menu">
                  <button onClick={() => rename(s)} title="Rename">✎</button>
                  <button onClick={() => remove(s)} title="Delete">🗑</button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function relTime(ms: number): string {
  const diff = Date.now() - ms;
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(ms).toLocaleDateString();
}
