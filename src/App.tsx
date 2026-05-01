import { ReactNode, useEffect, useState } from "react";
import {
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from "react-router-dom";
import { HugeiconsIcon } from "@hugeicons/react";
import { Loading03Icon } from "@hugeicons/core-free-icons";

import { ApiError, MeResponse, User, auth } from "./api";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Editor from "./pages/Editor";
import SharedEditor from "./pages/SharedEditor";
import InviteAccept from "./pages/InviteAccept";
import Admin from "./pages/Admin";
import Account from "./pages/Account";
import { Toaster } from "./components/ui/sonner";
import { TooltipProvider } from "./components/ui/tooltip";

type AuthStatus = "unknown" | "authed" | "anon";

export default function App() {
  const [status, setStatus] = useState<AuthStatus>("unknown");
  const [user, setUser] = useState<User | null>(null);
  const navigate = useNavigate();
  const location = useLocation();

  // Probe session once on boot. Public routes (login, invite, share) don't
  // need a session and shouldn't bounce to /login.
  useEffect(() => {
    let alive = true;
    auth
      .me()
      .then((me: MeResponse) => {
        if (!alive) return;
        setUser({
          id: me.id,
          email: me.email,
          firstName: me.firstName,
          lastName: me.lastName,
          isAdmin: me.isAdmin,
        });
        setStatus("authed");
      })
      .catch((_e: ApiError) => {
        if (!alive) return;
        setUser(null);
        setStatus("anon");
      });
    return () => {
      alive = false;
    };
  }, []);

  // When we become anon and we're on a protected page, kick to login.
  useEffect(() => {
    const p = location.pathname;
    const isPublic =
      p === "/login" || p.startsWith("/share/") || p.startsWith("/invite/");
    if (status === "anon" && !isPublic) {
      navigate(`/login?next=${encodeURIComponent(p + location.search)}`, {
        replace: true,
      });
    }
  }, [status, location.pathname, location.search, navigate]);

  function onAuthed(u: User) {
    setUser(u);
    setStatus("authed");
  }
  function onLogout() {
    setUser(null);
    setStatus("anon");
  }

  return (
    <TooltipProvider>
      {status === "unknown" ? (
        <BootSplash />
      ) : (
        <Routes>
          <Route path="/login" element={<Login onAuthed={onAuthed} />} />
          <Route
            path="/invite/:token"
            element={<InviteAccept onAuthed={onAuthed} />}
          />
          <Route
            path="/"
            element={
              status === "authed" && user ? (
                <Dashboard user={user} onLogout={onLogout} />
              ) : null
            }
          />
          <Route
            path="/s/:id"
            element={status === "authed" ? <Editor /> : null}
          />
          <Route
            path="/account"
            element={
              status === "authed" && user ? (
                <Account user={user} onUserChange={setUser} />
              ) : null
            }
          />
          <Route
            path="/admin"
            element={
              status === "authed" && user ? (
                <RequireAdmin user={user}>
                  <Admin user={user} />
                </RequireAdmin>
              ) : null
            }
          />
          <Route path="/share/:token" element={<SharedEditor />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      )}
      <Toaster position="bottom-right" />
    </TooltipProvider>
  );
}

function RequireAdmin({ user, children }: { user: User; children: ReactNode }) {
  if (!user.isAdmin) return <Navigate to="/" replace />;
  return <>{children}</>;
}

function BootSplash() {
  return (
    <div className="grid min-h-dvh place-items-center bg-background">
      <div className="flex flex-col items-center gap-3 text-muted-foreground">
        <div className="font-heading text-base font-semibold tracking-tight text-foreground">
          inkwell
        </div>
        <HugeiconsIcon
          icon={Loading03Icon}
          strokeWidth={2}
          className="size-4 animate-spin"
        />
      </div>
    </div>
  );
}
