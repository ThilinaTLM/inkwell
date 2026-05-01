import { FormEvent, useState } from "react";
import { Link } from "react-router-dom";
import { ApiError, User, auth } from "../api";

export default function Account({
  user,
  onUserChange: _onUserChange,
}: {
  user: User;
  onUserChange: (u: User) => void;
}) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setMsg(null);
    setErr(null);
    if (next !== confirm) {
      setErr("new passwords do not match");
      return;
    }
    if (next.length < 8) {
      setErr("new password must be at least 8 characters");
      return;
    }
    setBusy(true);
    try {
      await auth.changePassword(current, next);
      setMsg("Password updated.");
      setCurrent("");
      setNext("");
      setConfirm("");
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "could not change password");
    } finally {
      setBusy(false);
    }
  }

  const name =
    [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email;

  return (
    <div className="page">
      <header className="page-header">
        <Link to="/" className="dash-mark">inkwell</Link>
        <div className="page-title">Account</div>
      </header>

      <main className="page-body">
        <section className="card-section">
          <h2>Profile</h2>
          <dl className="kv">
            <dt>Name</dt>
            <dd>{name}</dd>
            <dt>Email</dt>
            <dd>{user.email}</dd>
            <dt>Role</dt>
            <dd>{user.isAdmin ? "Admin" : "User"}</dd>
          </dl>
        </section>

        <section className="card-section">
          <h2>Change password</h2>
          <form onSubmit={submit} className="stack-form">
            <input
              type="password"
              autoComplete="current-password"
              placeholder="Current password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              disabled={busy}
              required
            />
            <input
              type="password"
              autoComplete="new-password"
              placeholder="New password (min 8 chars)"
              value={next}
              onChange={(e) => setNext(e.target.value)}
              disabled={busy}
              required
              minLength={8}
            />
            <input
              type="password"
              autoComplete="new-password"
              placeholder="Confirm new password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              disabled={busy}
              required
              minLength={8}
            />
            {err && <div className="login-err">{err}</div>}
            {msg && <div className="ok">{msg}</div>}
            <button type="submit" disabled={busy || !current || !next || !confirm}>
              {busy ? "…" : "Update password"}
            </button>
          </form>
        </section>
      </main>
    </div>
  );
}
