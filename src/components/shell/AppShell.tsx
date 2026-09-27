// Authenticated layout route: TopBar + Sidebar + <Outlet/> + right
// details column + global overlays.
//
// PUBLIC CONTRACT
//   <AppShell />                 – use as a layout route element (RequireAuth built in)
//   useShell(): {
//     sidebarOpen: boolean;      // desktop: expanded; mobile: drawer open
//     toggleSidebar(): void;     // also ⌘\ / Ctrl+\ (view.sidebar)
//     detailsOpen: boolean;
//     setDetailsOpen(open: boolean): void;
//     toggleDetails(): void;     // also `I` (view.details)
//     isMobile: boolean;         // < 768px
//   }
//   useInShell(): boolean        – true inside the shell (AppPage uses it to drop its own chrome)
//
// Pages render inside <main> (a flex column; use PageFrame / PageToolbar /
// PageBody / StatusBar from ./page) and portal their inspector through
// <DetailsPanel>. The shell also:
//   - mounts useGlobalHotkeys (so single-key shortcuts never run in editors)
//   - registers the app command set (features/actions/itemCommands)
//   - publishes { route, currentFolderId } to the command context
//     (currentFolderId: null on "/", the id on /folders/:id, undefined elsewhere)
//   - clears the selection when the route changes
//   - mounts CommandPalette, ShortcutSheet, DialogHost and UploadTray

import { useQueryClient } from "@tanstack/react-query";
import { createContext, useContext, useEffect, useMemo, useRef } from "react";
import { matchPath, Outlet, useLocation, useNavigate } from "react-router-dom";
import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer";
import { useMe } from "@/data/auth";
import { registerAppCommands, setCommandNavigate } from "@/features/actions/itemCommands";
import { bindItemActionsRuntime } from "@/features/actions/useItemActions";
import { DialogHost } from "@/features/dialogs/DialogHost";
import { UploadTray } from "@/features/upload";
import { setCommandContext } from "@/lib/commands/registry";
import { useGlobalHotkeys } from "@/lib/commands/useGlobalHotkeys";
import { clearSelection, selectionStore } from "@/lib/selection";
import { useStore } from "@/lib/store";
import { useMediaQuery } from "@/lib/useMediaQuery";
import { cn } from "@/lib/utils";
import { CommandPalette } from "./CommandPalette";
import { detailsSlotStore } from "./DetailsPanel";
import { ShortcutSheet } from "./ShortcutSheet";
import { Sidebar } from "./Sidebar";
import {
  setDetailsOpen,
  setIsMobile,
  setSidebarOpen,
  toggleDetails,
  toggleSidebar,
  useShellState,
} from "./shellStore";
import { TopBar } from "./TopBar";

const InShellContext = createContext(false);

export function useInShell(): boolean {
  return useContext(InShellContext);
}

export function useShell() {
  const sidebarOpen = useShellState((s) => (s.isMobile ? s.mobileSidebarOpen : s.sidebarOpen));
  const detailsOpen = useShellState((s) => s.detailsOpen);
  const isMobile = useShellState((s) => s.isMobile);
  return useMemo(
    () => ({ sidebarOpen, toggleSidebar, detailsOpen, setDetailsOpen, toggleDetails, isMobile }),
    [sidebarOpen, detailsOpen, isMobile],
  );
}

function currentFolderFromPath(pathname: string): string | null | undefined {
  if (pathname === "/") return null;
  const m = matchPath("/folders/:folderId", pathname);
  return m?.params.folderId ?? undefined;
}

export function AppShell() {
  const me = useMe();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const isMobile = useMediaQuery("(max-width: 767px)");
  const isAdminRef = useRef(false);
  isAdminRef.current = !!me.data?.isAdmin;

  // Bind before children render so commands/actions work on first paint.
  bindItemActionsRuntime({ qc, navigate });

  useEffect(() => {
    setCommandNavigate((to) => navigate(to));
    return registerAppCommands({ isAdmin: () => isAdminRef.current });
  }, [navigate]);

  useEffect(() => setIsMobile(isMobile), [isMobile]);

  const pathname = location.pathname;
  // Snapshot the selection at render time: if a page sets a new
  // selection during this commit (e.g. from `?select=`), keep it;
  // otherwise drop the previous page's selection so commands can't act
  // on items that are no longer visible.
  const selAtRender = useRef(selectionStore.get());
  selAtRender.current = selectionStore.get();
  useEffect(() => {
    setCommandContext({ route: pathname, currentFolderId: currentFolderFromPath(pathname) });
    if (selectionStore.get() === selAtRender.current) clearSelection();
  }, [pathname]);

  useGlobalHotkeys();

  const sidebarOpen = useShellState((s) => s.sidebarOpen);
  const mobileSidebarOpen = useShellState((s) => s.mobileSidebarOpen);
  const detailsOpen = useShellState((s) => s.detailsOpen);
  const panelCount = useStore(detailsSlotStore, (s) => s.count);
  const showDetails = !isMobile && detailsOpen && panelCount > 0;

  if (!me.data) return null; // App.tsx redirects anonymous users to /login.
  const user = me.data;

  return (
    <InShellContext.Provider value={true}>
      <div className="flex h-dvh flex-col overflow-hidden bg-background text-foreground">
        <TopBar user={user} />
        <div className="flex min-h-0 flex-1">
          {!isMobile && sidebarOpen ? (
            <aside className="w-[232px] shrink-0 border-r border-border bg-card">
              <Sidebar isAdmin={user.isAdmin} />
            </aside>
          ) : null}
          <main id="main" className="flex min-w-0 flex-1 flex-col">
            <Outlet />
          </main>
          <aside
            ref={(el) => detailsSlotStore.set((s) => (s.el === el ? s : { ...s, el }))}
            aria-label="Details"
            className={cn(
              "w-[300px] shrink-0 overflow-y-auto border-l border-border bg-card",
              !showDetails && "hidden",
            )}
          />
        </div>
      </div>

      {isMobile ? (
        <Drawer
          open={mobileSidebarOpen}
          onOpenChange={(o) => setSidebarOpen(o)}
          swipeDirection="left"
        >
          <DrawerContent side="left" className="w-[272px] gap-0 bg-card p-0">
            <DrawerTitle className="sr-only">Navigation</DrawerTitle>
            <Sidebar isAdmin={user.isAdmin} onNavigate={() => setSidebarOpen(false)} />
          </DrawerContent>
        </Drawer>
      ) : null}

      <CommandPalette />
      <ShortcutSheet />
      <DialogHost />
      <UploadTray />
    </InShellContext.Provider>
  );
}
