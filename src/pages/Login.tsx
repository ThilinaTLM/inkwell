import { FormEvent, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ApiError, auth } from "../api";

export default function Login({ onAuthed }: { onAuthed: () => void }) {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = params.get("next") || "/";

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      await auth.login(password);
      onAuthed();
      navigate(next, { replace: true });
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : "login failed";
      setErr(msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login">
      <form onSubmit={submit} className="login-card">
        <div className="login-mark">inkwell</div>
        <p className="login-blurb">A small place for your Excalidraw scenes.</p>
        <input
          type="password"
          autoFocus
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={busy}
        />
        {err && <div className="login-err">{err}</div>}
        <button type="submit" disabled={busy || !password}>
          {busy ? "…" : "Enter"}
        </button>
      </form>
    </div>
  );
}
