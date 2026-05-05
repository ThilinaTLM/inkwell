// Per-device user preferences persisted to localStorage.
//
// Currently just `useDefaultFileKind` (the default for the New File
// split-button). Lives in `src/lib/` rather than under any single
// feature because the explorer header and the editor page both
// branch on it.
//
// localStorage may be unavailable (private browsing, embedded
// webviews, SSR-style first render) — every read/write is wrapped in
// try/catch and falls back to in-memory state.

import { useCallback, useEffect, useState } from "react";
import type { FileKind } from "@/lib/api/client";

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
