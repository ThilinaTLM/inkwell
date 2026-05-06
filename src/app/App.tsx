// Auth-aware shell.
//
// `App` owns exactly two concerns:
//   1) Probe the session (`useMe`) and render a boot splash until it
//      resolves the first time.
//   2) When the session resolves anonymous on a protected route, kick
//      the user to /login with a `next=` redirect so they land back
//      where they were after signing in.
//
// Route definitions and individual pages live in `./routes`.

import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { InkwellMark } from "@/components/InkwellMark";
import { useMe } from "@/data/auth";
import { AppRoutes } from "./routes";

const PUBLIC_PATHS = ["/login"] as const;
const PUBLIC_PREFIXES = ["/share/", "/invite/"] as const;

function isPublicPath(pathname: string): boolean {
  if (PUBLIC_PATHS.includes(pathname as (typeof PUBLIC_PATHS)[number])) return true;
  return PUBLIC_PREFIXES.some((p) => pathname.startsWith(p));
}

export default function App() {
  const me = useMe();
  const navigate = useNavigate();
  const location = useLocation();

  // When we know we're anonymous and we're on a protected page, redirect.
  useEffect(() => {
    if (!me.isError) return;
    if (isPublicPath(location.pathname)) return;
    navigate(`/login?next=${encodeURIComponent(location.pathname + location.search)}`, {
      replace: true,
    });
  }, [me.isError, location.pathname, location.search, navigate]);

  // First boot: render splash while the session probe is in flight.
  if (me.isPending) return <BootSplash />;

  return <AppRoutes />;
}

function BootSplash() {
  return (
    <div className="grid min-h-dvh place-items-center bg-background">
      <div className="flex flex-col items-center gap-3">
        <InkwellMark animate className="size-14 text-foreground" />
        <div className="font-heading text-2xl font-semibold tracking-tight text-muted-foreground">
          inkwell
        </div>
      </div>
    </div>
  );
}
