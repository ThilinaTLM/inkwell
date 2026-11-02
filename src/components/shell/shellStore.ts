// Shell UI state (outside React so commands can toggle it).
//
// PUBLIC CONTRACT
//   shellStore – createStore<ShellState>
//   toggleSidebar() / setSidebarOpen(open)
//   openPalette(initialQuery?) / closePalette()
//   openShortcutSheet() / closeShortcutSheet()
//   useShellState(selector)
//
// Most consumers should use `useShell()` from `./AppShell` instead.

import { createStore, useStore } from "@/lib/store";

export interface ShellState {
  /** Desktop: sidebar expanded. Mobile: drawer open. */
  sidebarOpen: boolean;
  mobileSidebarOpen: boolean;
  paletteOpen: boolean;
  paletteQuery: string;
  sheetOpen: boolean;
  isMobile: boolean;
}

const SIDEBAR_KEY = "inkwell.shell.sidebarOpen";

function readBool(key: string, fallback: boolean): boolean {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : v === "1";
  } catch {
    return fallback;
  }
}

function writeBool(key: string, v: boolean) {
  try {
    localStorage.setItem(key, v ? "1" : "0");
  } catch {
    /* ignore */
  }
}

export const shellStore = createStore<ShellState>({
  sidebarOpen: typeof localStorage === "undefined" ? true : readBool(SIDEBAR_KEY, true),
  mobileSidebarOpen: false,
  paletteOpen: false,
  paletteQuery: "",
  sheetOpen: false,
  isMobile: false,
});

export function useShellState<S>(selector: (s: ShellState) => S): S {
  return useStore(shellStore, selector);
}

export function setSidebarOpen(open: boolean): void {
  const s = shellStore.get();
  if (s.isMobile) {
    shellStore.set({ ...s, mobileSidebarOpen: open });
    return;
  }
  writeBool(SIDEBAR_KEY, open);
  shellStore.set({ ...s, sidebarOpen: open });
}

export function toggleSidebar(): void {
  const s = shellStore.get();
  setSidebarOpen(s.isMobile ? !s.mobileSidebarOpen : !s.sidebarOpen);
}

export function openPalette(initialQuery = ""): void {
  shellStore.set((s) => ({
    ...s,
    paletteOpen: true,
    paletteQuery: initialQuery,
    sheetOpen: false,
  }));
}

export function closePalette(): void {
  shellStore.set((s) => ({ ...s, paletteOpen: false }));
}

export function openShortcutSheet(): void {
  shellStore.set((s) => ({ ...s, sheetOpen: true, paletteOpen: false }));
}

export function closeShortcutSheet(): void {
  shellStore.set((s) => ({ ...s, sheetOpen: false }));
}

export function setIsMobile(isMobile: boolean): void {
  shellStore.set((s) => (s.isMobile === isMobile ? s : { ...s, isMobile }));
}
