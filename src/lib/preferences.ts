// Per-device user preferences persisted to localStorage.
//
// `useDefaultFileKind` — default for the New File split-button.
// `useDrawioStylePref` / `useDrawioStyle` — Editor style preference
// for the drawio editor (auto / classic / sketch). Lives in
// `src/lib/` rather than under any single feature because the
// explorer header, editor page, and account page all branch on it.
//
// localStorage may be unavailable (private browsing, embedded
// webviews, SSR-style first render) — every read/write is wrapped in
// try/catch and falls back to in-memory state.

import { useCallback, useEffect, useState } from "react";
import type { FileKind } from "@/lib/api/client";
import { useMediaQuery } from "@/lib/useMediaQuery";

const DEFAULT_FILE_KIND_KEY = "inkwell.defaultFileKind";

function readStoredKind(): FileKind {
  try {
    const v = localStorage.getItem(DEFAULT_FILE_KIND_KEY);
    return v === "drawio" ? "drawio" : "excalidraw";
  } catch {
    return "excalidraw";
  }
}

function writeStoredKind(kind: FileKind): void {
  try {
    localStorage.setItem(DEFAULT_FILE_KIND_KEY, kind);
  } catch {
    /* ignore */
  }
}

export function useDefaultFileKind(): [FileKind, (kind: FileKind) => void] {
  const [kind, setKindState] = useState<FileKind>(readStoredKind);

  // Keep multiple tabs in sync — the `storage` event fires on changes
  // made in *other* tabs of the same origin.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== DEFAULT_FILE_KIND_KEY) return;
      setKindState(e.newValue === "drawio" ? "drawio" : "excalidraw");
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const setKind = useCallback((next: FileKind) => {
    writeStoredKind(next);
    setKindState(next);
  }, []);

  return [kind, setKind];
}

// ---------------------------------------------------------------------------
// Drawio editor style preference
// ---------------------------------------------------------------------------
//
// Three values:
//   "auto"    — sketch on touch+small viewports, classic everywhere else
//   "classic" — always Kennedy theme (today's default)
//   "sketch"  — always sketch theme (touch-first floating UI)
//
// The pref is *device-local* (matches `useDefaultFileKind`); cross-
// device sync would require a backend column and is deferred.
//
// `useDrawioStyle()` is the resolver every consumer should call
// instead of branching on the raw pref — it folds in the media query
// for the "auto" case so callers never need to repeat the breakpoint.

export type DrawioStylePref = "auto" | "classic" | "sketch";
export type DrawioStyle = "classic" | "sketch";

const DRAWIO_STYLE_KEY = "inkwell.drawioStyle";

// Touch + narrow viewport. Phones and tablet portrait match; desktop
// (even with a touchscreen) does not, because Kennedy works fine
// with a mouse on those devices. Users on touch laptops who *prefer*
// sketch can opt in via the explicit "sketch" pref.
const TOUCH_SMALL_QUERY = "(pointer: coarse) and (max-width: 900px)";

function readStoredDrawioStyle(): DrawioStylePref {
  try {
    const v = localStorage.getItem(DRAWIO_STYLE_KEY);
    if (v === "auto" || v === "classic" || v === "sketch") return v;
  } catch {
    /* storage unavailable */
  }
  return "auto";
}

function writeStoredDrawioStyle(v: DrawioStylePref): void {
  try {
    localStorage.setItem(DRAWIO_STYLE_KEY, v);
  } catch {
    /* ignore */
  }
}

export function useDrawioStylePref(): [DrawioStylePref, (next: DrawioStylePref) => void] {
  const [pref, setPrefState] = useState<DrawioStylePref>(readStoredDrawioStyle);

  // Cross-tab sync — picks up changes the user makes on the Account
  // page in another tab.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== DRAWIO_STYLE_KEY) return;
      const v = e.newValue;
      setPrefState(v === "classic" || v === "sketch" ? v : "auto");
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const setPref = useCallback((next: DrawioStylePref) => {
    writeStoredDrawioStyle(next);
    setPrefState(next);
  }, []);

  return [pref, setPref];
}

/**
 * Resolved style — what the editor should actually render. Folds the
 * stored pref together with the touch-and-narrow media query so
 * callers don't have to know the breakpoint.
 *
 * Reactive to both pref changes and OS-level pointer/viewport changes
 * (e.g. plugging a mouse into a tablet).
 */
export function useDrawioStyle(): DrawioStyle {
  const [pref] = useDrawioStylePref();
  const touchSmall = useMediaQuery(TOUCH_SMALL_QUERY);
  if (pref === "classic") return "classic";
  if (pref === "sketch") return "sketch";
  return touchSmall ? "sketch" : "classic";
}
