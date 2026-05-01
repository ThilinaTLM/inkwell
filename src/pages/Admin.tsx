import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  AdminUser,
  ApiError,
  Invite,
  InviteStatus,
  User,
  admin,
} from "../api";

type Tab = "users" | "invites";

export default function Admin({ user: self }: { user: User }) {
  const [tab, setTab] = useState<Tab>("users");

  return (
    <div className="page">
      <header className="page-header">
        <Link to="/" className="dash-mark">inkwell</Link>
        <div className="page-title">Admin</div>
        <div className="tabs">
          <button
            className={tab === "users" ? "tab tab-active" : "tab"}
            onClick={() => setTab("users")}
          >
            Users
          </button>
          <button
            className={tab === "invites" ? "tab tab-active" : "tab"}
            onClick={() => setTab("invites")}
          >
            Invites
          </button>
        </div>
      </header>

      <main className="page-body">
        {tab === "users" ? <UsersPanel selfId={self.id} /> : <InvitesPanel />}
      </main>
    </div>
  );
}

// ─── Users ────────────────────────────────────────────────────────────
function UsersPanel({ selfId }: { selfId: string }) {
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<AdminUser | null>(null);

  async function refresh() {
    try {
      setUsers(await admin.listUsers());
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "failed to load users");
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function patch(u: AdminUser, body: Parameters<typeof admin.updateUser>[1]) {
    setBusyId(u.id);
    setErr(null);
    try {
      const updated = await admin.updateUser(u.id, body);
      setUsers((prev) => (prev ? prev.map((x) => (x.id === u.id ? updated : x)) : prev));
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "update failed");
    } finally {
      setBusyId(null);
    }
  }

  async function doDelete(u: AdminUser) {
    setBusyId(u.id);
    setErr(null);
    try {
      await admin.deleteUser(u.id);
      setUsers((prev) => (prev ? prev.filter((x) => x.id !== u.id) : prev));
      setConfirmDelete(null);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "delete failed");
    } finally {
      setBusyId(null);
    }
  }

  if (users === null) return <div className="muted">Loading…</div>;

  return (
    <section className="card-section">
      <h2>Users ({users.length})</h2>
      {err && <div className="login-err">{err}</div>}

      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Role</th>
              <th>Status</th>
              <th>Scenes</th>
              <th>Created</th>
              <th>Last login</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => {
              const isSelf = u.id === selfId;
              const name =
                [u.firstName, u.lastName].filter(Boolean).join(" ") || "—";
              return (
                <tr key={u.id} className={u.disabled ? "row-disabled" : ""}>
                  <td>
                    {name}
                    {isSelf && <span className="badge">you</span>}
                  </td>
                  <td>{u.email}</td>
                  <td>{u.isAdmin ? "Admin" : "User"}</td>
                  <td>{u.disabled ? "Disabled" : "Active"}</td>
                  <td>{u.sceneCount}</td>
                  <td>{fmtDate(u.createdAt)}</td>
                  <td>{u.lastLoginAt ? fmtDate(u.lastLoginAt) : "—"}</td>
                  <td className="row-actions">
                    {!isSelf && (
                      <>
                        <button
                          disabled={busyId === u.id}
                          onClick={() => patch(u, { isAdmin: !u.isAdmin })}
                          title={u.isAdmin ? "Demote to user" : "Promote to admin"}
                        >
                          {u.isAdmin ? "Demote" : "Promote"}
                        </button>
                        <button
                          disabled={busyId === u.id}
                          onClick={() => patch(u, { disabled: !u.disabled })}
                        >
                          {u.disabled ? "Enable" : "Disable"}
                        </button>
                        <button
                          className="danger"
                          disabled={busyId === u.id}
                          onClick={() => setConfirmDelete(u)}
                        >
                          Delete
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {confirmDelete && (
        <DeleteUserModal
          user={confirmDelete}
          busy={busyId === confirmDelete.id}
          onCancel={() => setConfirmDelete(null)}
          onConfirm={() => doDelete(confirmDelete)}
        />
      )}
    </section>
  );
}

function DeleteUserModal({
  user,
  busy,
  onCancel,
  onConfirm,
}: {
  user: AdminUser;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const [typed, setTyped] = useState("");
  const phrase = `DELETE ${user.email}`;
  const matches = typed === phrase;
  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>Delete user</h3>
        <p>
          This will permanently delete <strong>{user.email}</strong>, all their
          scenes ({user.sceneCount}), and any share tokens they own. This cannot
          be undone.
        </p>
        <p>
          Type <code>{phrase}</code> to confirm:
        </p>
        <input
          type="text"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          autoFocus
          disabled={busy}
        />
        <div className="modal-actions">
          <button onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button className="danger" onClick={onConfirm} disabled={!matches || busy}>
            {busy ? "…" : "Delete user"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Invites ──────────────────────────────────────────────────────────
const EXPIRY_OPTIONS: { label: string; hours: number | null }[] = [
  { label: "1 hour", hours: 1 },
  { label: "1 day", hours: 24 },
  { label: "7 days", hours: 24 * 7 },
  { label: "30 days", hours: 24 * 30 },
  { label: "Never", hours: null },
];

function InvitesPanel() {
  const [list, setList] = useState<Invite[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [hours, setHours] = useState<number | null>(24 * 7);
  const [latest, setLatest] = useState<{ url: string; token: string } | null>(null);
  const [copied, setCopied] = useState(false);

  async function refresh() {
    try {
      setList(await admin.listInvites());
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "failed to load invites");
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function generate() {
    setBusy(true);
    setErr(null);
    setCopied(false);
    try {
      const inv = await admin.createInvite(hours);
      // Build a fully-qualified URL even if the server returned a relative one.
      const absolute = inv.url.startsWith("http")
        ? inv.url
        : `${window.location.origin}${inv.url}`;
      setLatest({ url: absolute, token: inv.token });
      await refresh();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "could not create invite");
    } finally {
      setBusy(false);
    }
  }

  async function copy(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  }

  async function revoke(token: string) {
    if (!confirm("Revoke this invite? It will become unusable immediately.")) return;
    setBusy(true);
    setErr(null);
    try {
      await admin.revokeInvite(token);
      await refresh();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "revoke failed");
    } finally {
      setBusy(false);
    }
  }

  const sorted = useMemo(
    () => (list ? [...list].sort((a, b) => b.createdAt - a.createdAt) : null),
    [list]
  );

  return (
    <>
      <section className="card-section">
        <h2>Generate invite</h2>
        <div className="row gap">
          <select
            value={String(hours)}
            onChange={(e) => {
              const v = e.target.value;
              setHours(v === "null" ? null : Number(v));
            }}
            disabled={busy}
          >
            {EXPIRY_OPTIONS.map((o) => (
              <option key={o.label} value={String(o.hours)}>
                Expires in {o.label}
              </option>
            ))}
          </select>
          <button onClick={generate} disabled={busy}>
            {busy ? "…" : "Create invite link"}
          </button>
        </div>
        {latest && (
          <div className="invite-out">
            <input readOnly value={latest.url} onFocus={(e) => e.currentTarget.select()} />
            <button onClick={() => copy(latest.url)}>{copied ? "Copied!" : "Copy"}</button>
          </div>
        )}
        {err && <div className="login-err">{err}</div>}
      </section>

      <section className="card-section">
        <h2>Invites ({sorted?.length ?? 0})</h2>
        {sorted === null ? (
          <div className="muted">Loading…</div>
        ) : sorted.length === 0 ? (
          <div className="muted">No invites yet.</div>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Token</th>
                  <th>Status</th>
                  <th>Created</th>
                  <th>Expires</th>
                  <th>Used by</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((inv) => (
                  <tr key={inv.token}>
                    <td>
                      <code className="mono">{inv.token.slice(0, 10)}…</code>
                    </td>
                    <td>
                      <StatusPill status={inv.status} />
                    </td>
                    <td>{fmtDate(inv.createdAt)}</td>
                    <td>{inv.expiresAt ? fmtDate(inv.expiresAt) : "Never"}</td>
                    <td>{inv.usedByEmail ?? "—"}</td>
                    <td className="row-actions">
                      {inv.status === "pending" && (
                        <>
                          <button
                            onClick={() =>
                              copy(`${window.location.origin}/invite/${inv.token}`)
                            }
                          >
                            Copy link
                          </button>
                          <button className="danger" onClick={() => revoke(inv.token)}>
                            Revoke
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}

function StatusPill({ status }: { status: InviteStatus }) {
  return <span className={`pill pill-${status}`}>{status}</span>;
}

function fmtDate(ms: number): string {
  const d = new Date(ms);
  return d.toLocaleDateString() + " " + d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
