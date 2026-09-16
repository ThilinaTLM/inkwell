// AppShell — the frame every authenticated dashboard page renders into.
//
// Layout: a fixed-width sidebar column and a content column holding the
// sticky top bar plus a scrollable `<main>`. The shell also owns:
//   - sidebar collapse state (persisted, `inkwell:sidebar`)
//   - the mobile navigation overlay
//   - the command palette
//   - the file/folder action dialogs (via <ExplorerActionsProvider>)
//
// Editor routes deliberately do NOT use this shell — they are
// full-bleed surfaces that own their own chrome.

import { Cancel01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { type ReactNode, useCallback, useEffect, useState } from "react";
import { useLocation } from "react-router-dom";

import { CommandPalette } from "@/components/CommandPalette";
import { AppTopbar } from "@/components/layout/AppTopbar";
import { Sidebar } from "@/components/layout/Sidebar";
import { Button } from "@/components/ui/button";
import { useMe } from "@/data/auth";
import { ExplorerActionsProvider } from "@/features/explorer/ExplorerActionsProvider";
import { cn } from "@/lib/utils";

const COLLAPSE_KEY = "inkwell:sidebar";

function readCollapsed(): boolean {
  try {
    return localStorage.getItem(COLLAPSE_KEY) === "collapsed";
  } catch {
    return false;
  }
}

interface AppShellProps {
  children: ReactNode;
  /** Remove the default page padding (used by the full-height folder browser). */
  bare?: boolean;
}

export function AppShell({ children, bare }: AppShellProps) {
  const me = useMe();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [mobileNav, setMobileNav] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem(COLLAPSE_KEY, collapsed ? "collapsed" : "expanded");
    } catch {
      /* storage unavailable */
    }
  }, [collapsed]);

  // Close the mobile drawer on navigation.
  // biome-ignore lint/correctness/useExhaustiveDependencies: close on every route change
  useEffect(() => {
    setMobileNav(false);
  }, [location.pathname]);

  // ⌘K / Ctrl-K opens the palette, ⌘\ toggles the sidebar.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      } else if (mod && e.key === "\\") {
        e.preventDefault();
        setCollapsed((c) => !c);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const closeMobile = useCallback(() => setMobileNav(false), []);

  if (!me.data) return null;
  const user = me.data;

  return (
    <ExplorerActionsProvider>
      <div className="flex h-dvh w-full overflow-hidden bg-background">
        {/* Desktop sidebar */}
        <aside
          className={cn(
            "hidden shrink-0 border-r border-sidebar-border md:block",
            collapsed ? "w-14" : "w-60",
          )}
        >
          <Sidebar user={user} collapsed={collapsed} />
        </aside>

        {/* Mobile overlay sidebar */}
        {mobileNav ? (
          <div className="fixed inset-0 z-50 md:hidden">
            <button
              type="button"
              aria-label="Close navigation"
              className="absolute inset-0 bg-foreground/30 backdrop-blur-[1px]"
              onClick={closeMobile}
            />
            <div className="absolute inset-y-0 left-0 w-64 border-r border-sidebar-border bg-sidebar shadow-lg">
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Close navigation"
                className="absolute right-2 top-3 z-10"
                onClick={closeMobile}
              >
                <HugeiconsIcon icon={Cancel01Icon} strokeWidth={1.7} />
              </Button>
              <Sidebar user={user} collapsed={false} onNavigate={closeMobile} />
            </div>
          </div>
        ) : null}

        {/* Content column */}
        <div className="flex min-w-0 flex-1 flex-col">
          <AppTopbar
            user={user}
            onToggleSidebar={() => setCollapsed((c) => !c)}
            onOpenMobileNav={() => setMobileNav(true)}
            onOpenPalette={() => setPaletteOpen(true)}
          />
          <main
            className={cn(
              "flex min-h-0 flex-1 flex-col",
              bare ? "overflow-hidden" : "overflow-y-auto px-4 pb-10 pt-1 sm:px-6",
            )}
          >
            {children}
          </main>
        </div>
      </div>

      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
    </ExplorerActionsProvider>
  );
}
