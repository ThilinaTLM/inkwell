import { useEffect, useState } from "react";
import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { ApiError, auth } from "./api";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Editor from "./pages/Editor";
import SharedEditor from "./pages/SharedEditor";

type AuthState = "unknown" | "authed" | "anon";

export default function App() {
  const [state, setState] = useState<AuthState>("unknown");
  const navigate = useNavigate();
  const location = useLocation();

  // Probe session once on boot. Share routes don't need a session, so we
  // don't redirect while on /share/*.
  useEffect(() => {
    let alive = true;
    auth
      .me()
      .then(() => alive && setState("authed"))
      .catch((e: ApiError) => {
        if (!alive) return;
        if (e.status === 401) setState("anon");
        else setState("anon");
      });
    return () => {
      alive = false;
    };
  }, []);

  // When we transition to anon and we're on a protected page, kick to login.
  useEffect(() => {
    const onProtected = !["/login"].includes(location.pathname) && !location.pathname.startsWith("/share/");
    if (state === "anon" && onProtected) {
      navigate(`/login?next=${encodeURIComponent(location.pathname + location.search)}`, {
        replace: true,
      });
    }
  }, [state, location.pathname, location.search, navigate]);

  if (state === "unknown") return <BootSplash />;

  return (
    <Routes>
      <Route path="/login" element={<Login onAuthed={() => setState("authed")} />} />
      <Route path="/" element={state === "authed" ? <Dashboard onLogout={() => setState("anon")} /> : null} />
      <Route path="/s/:id" element={state === "authed" ? <Editor /> : null} />
      <Route path="/share/:token" element={<SharedEditor />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function BootSplash() {
  return (
    <div className="boot">
      <div className="boot-mark">inkwell</div>
    </div>
  );
}
