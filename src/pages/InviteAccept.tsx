import { FormEvent, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ApiError, User, invites } from "../api";

type PeekState =
  | { kind: "loading" }
  | { kind: "ok"; expiresAt: number | null }
  | { kind: "error"; status: number; message: string };

export default function InviteAccept({ onAuthed }: { onAuthed: (u: User) => void }) {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();

  const [peek, setPeek] = useState<PeekState>({ kind: "loading" });
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    if (!token) return;
    invites
      .peek(token)
      .then((r) => {
        if (alive) setPeek({ kind: "ok", expiresAt: r.expiresAt });
      })
      .catch((e: ApiError) => {
        if (!alive) return;
        setPeek({
          kind: "error",
          status: e.status,
          message: e.message || "invite unavailable",
        });
      });
    return () => {
      alive = false;
    };
  }, [token]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!token) return;
    if (password !== confirm) {
      setErr("passwords do not match");
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const user = await invites.accept(token, {
        email: email.trim(),
        password,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
      });
      onAuthed(user);
      navigate("/", { replace: true });
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "could not create account");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login">
      <div className="login-card">
        <div className="login-mark">inkwell</div>

        {peek.kind === "loading" && <p className="login-blurb">Checking invite…</p>}

        {peek.kind === "error" && (
          <>
            <p className="login-blurb">This invite can't be used.</p>
            <div className="login-err">{peek.message}</div>
            <button type="button" onClick={() => navigate("/login")}>
              Go to login
            </button>
          </>
        )}

        {peek.kind === "ok" && (
          <>
            <p className="login-blurb">
              Create your account.
              {peek.expiresAt && (
                <>
                  {" "}
                  <span className="login-hint">
                    (Invite expires {new Date(peek.expiresAt).toLocaleString()})
                  </span>
                </>
              )}
            </p>
            <form onSubmit={submit} className="login-form">
              <div className="login-row">
                <input
                  type="text"
                  autoComplete="given-name"
                  placeholder="First name"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  disabled={busy}
                />
                <input
                  type="text"
                  autoComplete="family-name"
                  placeholder="Last name"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  disabled={busy}
                />
              </div>
              <input
                type="email"
                autoComplete="email"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={busy}
                required
              />
              <input
                type="password"
                autoComplete="new-password"
                placeholder="Password (min 8 chars)"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={busy}
                required
                minLength={8}
              />
              <input
                type="password"
                autoComplete="new-password"
                placeholder="Confirm password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                disabled={busy}
                required
                minLength={8}
              />
              {err && <div className="login-err">{err}</div>}
              <button
                type="submit"
                disabled={busy || !email || !password || password !== confirm}
              >
                {busy ? "…" : "Create account"}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
