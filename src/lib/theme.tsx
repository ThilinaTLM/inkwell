// Theme — light/dark/system preference, app-wide.
//
// Single source of truth for theme. Owns the `.dark` class on
// `<html>` and the `inkwell:theme` localStorage key. The inline FOUC
// script in `index.html` resolves the same key before first paint;
// the rules here MUST stay aligned with that script.
//
// Modes:
//   "light"  — explicit light, ignores OS preference
//   "dark"   — explicit dark, ignores OS preference
//   "system" — follows `prefers-color-scheme`, reactive to OS flips
//
// Excalidraw consumes `resolved` via SceneEditor's `theme` prop, so
// the canvas always renders the same theme as the rest of the app.

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

export type ThemeMode = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

interface ThemeContextValue {
  /** User's stored preference. */
  mode: ThemeMode;
  /** What's actually applied right now ("light" | "dark"). */
  resolved: ResolvedTheme;
  setMode: (m: ThemeMode) => void;
  /** Flip between light and dark, materializing an explicit choice. */
  toggle: () => void;
  /** Cycle light → dark → system → light. */
  cycle: () => void;
}

const STORAGE_KEY = "inkwell:theme";
const DARK_QUERY = "(prefers-color-scheme: dark)";

const ThemeContext = createContext<ThemeContextValue | null>(null);

function readStoredMode(): ThemeMode {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === "light" || v === "dark" || v === "system") return v;
  } catch {
    /* storage unavailable */
  }
  return "system";
}

function systemPrefersDark(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia(DARK_QUERY).matches;
}

function resolve(mode: ThemeMode): ResolvedTheme {
  if (mode === "system") return systemPrefersDark() ? "dark" : "light";
  return mode;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>(() => readStoredMode());
  const [resolved, setResolved] = useState<ResolvedTheme>(() => resolve(mode));

  // Apply the resolved class to <html>. The FOUC script in index.html
  // already did this once before paint; this is a no-op write whenever
  // it agrees with us, and a corrective write otherwise.
  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("dark", resolved === "dark");
  }, [resolved]);

  // Persist the user's mode choice. Skip writing the default on first
  // mount so we don't lock new visitors into "system" until they pick.
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, mode);
    } catch {
      /* storage unavailable */
    }
  }, [mode]);

  // When mode is "system", react to OS-level theme flips.
  useEffect(() => {
    if (mode !== "system") {
      setResolved(mode);
      return;
    }
    const mql = window.matchMedia(DARK_QUERY);
    const apply = () => setResolved(mql.matches ? "dark" : "light");
    apply();
    mql.addEventListener("change", apply);
    return () => mql.removeEventListener("change", apply);
  }, [mode]);

  const setMode = useCallback((m: ThemeMode) => setModeState(m), []);

  const toggle = useCallback(() => {
    // Materialize an explicit choice — flipping from "system → dark"
    // produces "light" rather than another "system" reading.
    setModeState(resolved === "dark" ? "light" : "dark");
  }, [resolved]);

  const cycle = useCallback(() => {
    const next: Record<ThemeMode, ThemeMode> = {
      light: "dark",
      dark: "system",
      system: "light",
    };
    setModeState(next[mode]);
  }, [mode]);

  const value = useMemo<ThemeContextValue>(
    () => ({ mode, resolved, setMode, toggle, cycle }),
    [mode, resolved, setMode, toggle, cycle],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useTheme must be used inside <ThemeProvider>");
  }
  return ctx;
}
