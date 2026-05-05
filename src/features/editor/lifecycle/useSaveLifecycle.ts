// Editor save lifecycle.
//
// Owns the autosave loop both `ExcalidrawEditor` and `DrawioEditor`
// historically reimplemented:
//
//   * `versionRef` (the optimistic-concurrency token sent as `If-Match`)
//   * `inflightRef` / `savePromiseRef` / `saveQueuedRef` — concurrency
//     model so a save in flight coalesces with newer changes rather
//     than racing
//   * `savedFpRef` — fingerprint of the last successfully persisted
//     content, used to dedup no-op saves
//   * The 30s `useDebounced` wrapper around the loop, plus `saveNow`
//     / `discardPendingLocalWork`
//   * The `beforeunload` (with `e.returnValue = ""` while dirty) +
//     `visibilitychange` flush listeners
//   * Resetting state when the parent loads a different file (or the
//     same file at a fresh version after a 409 reload)
//
// The hook is transport- and snapshot-agnostic: the editor passes a
// `getLatest()` closure that returns its current snapshot fingerprint
// + serialised blob, plus a `transport` that knows how to PUT the
// blob and re-fetch on conflict.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ApiError } from "@/lib/api/client";
import { errorMessage } from "@/lib/errors";
import type { EditorSaveStatus, SaveLifecycleTransport } from "./types";
import { useDebounced } from "./useDebounced";

// 30s autosave debounce. Both editors used this exact value
// independently — keeping it in one place is the whole point of this
// extraction.
export const SAVE_DEBOUNCE_MS = 30_000;

/**
 * Snapshot returned by `getLatest()`. The fingerprint is a cheap
 * content hash the editor computes; the blob is whatever the
 * transport's `save` accepts.
 */
export interface SaveSnapshot<TBlob> {
  fp: string;
  blob: TBlob;
}

export interface UseSaveLifecycleOptions<TBlob, TLoaded> {
  initialVersion: number;
  initialFingerprint: string;
  /** Read-only sessions (share-token reads) skip the entire save path. */
  readOnly: boolean;
  transport: SaveLifecycleTransport<TBlob, TLoaded>;
  /** Returns the latest in-memory snapshot to persist, or null if there
   *  is nothing pending. Called on every save attempt; the editor
   *  closes over its mutable snapshot ref. */
  getLatest: () => SaveSnapshot<TBlob> | null;
  /** Fired after each successful save with the snapshot that was
   *  written. Editors use this to schedule a thumbnail upload. */
  onSaved?: (saved: SaveSnapshot<TBlob>) => void;
  /** Fired after a 409 → reload succeeded. The hook updates its own
   *  internal version ref before invoking this. */
  onReload?: (loaded: TLoaded, freshVersion: number) => void;
  debounceMs?: number;
}

export interface UseSaveLifecycleResult {
  status: EditorSaveStatus;
  errorMessage: string | null;
  isDirty: boolean;
  /** Tell the lifecycle that the editor pushed a fresh snapshot.
   *  Triggers dedup against `savedFp` and schedules the debounced
   *  save when content differs. */
  notifyChange: () => void;
  /** Cancel the debounce and force-save the current latest. Returns
   *  `true` on success (or read-only no-op), `false` if the save
   *  errored or hit a 409. */
  saveNow: () => Promise<boolean>;
  /** Discard pending local work (the dialog Discard branch). */
  discardPendingLocalWork: () => void;
  /** Reset state when the parent loads a different file (or the
   *  same file at a fresh version after an external reload). */
  reset: (newVersion: number, newFingerprint: string) => void;
}

export function useSaveLifecycle<TBlob, TLoaded>(
  opts: UseSaveLifecycleOptions<TBlob, TLoaded>,
): UseSaveLifecycleResult {
  const {
    initialVersion,
    initialFingerprint,
    readOnly,
    transport,
    getLatest,
    onSaved,
    onReload,
    debounceMs = SAVE_DEBOUNCE_MS,
  } = opts;

  // A freshly loaded scene matches the server by construction, so the
  // initial state is "saved", not "idle". Anything else surfaces a
  // misleading "Ready" indicator on first paint.
  const [status, setStatus] = useState<EditorSaveStatus>("saved");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Mutable refs so the debounced loop always sees the latest values
  // without re-creating itself.
  const versionRef = useRef(initialVersion);
  const savedFpRef = useRef(initialFingerprint);
  const inflightRef = useRef(false);
  const savePromiseRef = useRef<Promise<boolean> | null>(null);
  // Tells the loop to take another lap after the in-flight save
  // resolves (a newer snapshot was pushed during the save).
  const saveQueuedRef = useRef(false);

  // Capture the latest closures via refs so the inner loop's
  // dependency list stays small and the saveLatest callback is stable.
  const transportRef = useRef(transport);
  transportRef.current = transport;
  const getLatestRef = useRef(getLatest);
  getLatestRef.current = getLatest;
  const onSavedRef = useRef(onSaved);
  onSavedRef.current = onSaved;
  const onReloadRef = useRef(onReload);
  onReloadRef.current = onReload;
  const readOnlyRef = useRef(readOnly);
  readOnlyRef.current = readOnly;

  // ─── The save loop ──────────────────────────────────────────────────
  const saveLatest = useCallback(async (): Promise<boolean> => {
    if (readOnlyRef.current) return true;

    // Coalesce: if a save is already in flight, mark that we want
    // another lap and return the in-flight promise. The running loop
    // will read `latest` again on its next iteration.
    if (inflightRef.current) {
      saveQueuedRef.current = true;
      return savePromiseRef.current ?? Promise.resolve(false);
    }

    const task = (async (): Promise<boolean> => {
      inflightRef.current = true;
      try {
        while (true) {
          const snapshot = getLatestRef.current();
          if (!snapshot || snapshot.fp === savedFpRef.current) {
            saveQueuedRef.current = false;
            setStatus("saved");
            setErrorMsg(null);
            return true;
          }

          setStatus("saving");
          setErrorMsg(null);

          try {
            const res = await transportRef.current.save(versionRef.current, snapshot.blob);
            versionRef.current = res.version;
            savedFpRef.current = snapshot.fp;
            // Success: notify the editor (it may want to fire a thumb).
            // Fire-and-forget; thumb-pipeline-side dedup short-circuits
            // a no-op upload.
            try {
              onSavedRef.current?.(snapshot);
            } catch {
              // Don't let an onSaved error cancel further save laps.
            }
          } catch (e) {
            if (e instanceof ApiError && e.status === 409 && transportRef.current.reload) {
              try {
                const fresh = await transportRef.current.reload();
                const freshVersion = (fresh as unknown as { meta: { version: number } }).meta
                  .version;
                versionRef.current = freshVersion;
                onReloadRef.current?.(fresh, freshVersion);
                setStatus("error");
                setErrorMsg("Refreshed: another tab saved a newer version.");
              } catch {
                setStatus("error");
                setErrorMsg("Conflict; reload failed.");
              }
            } else {
              setStatus("error");
              setErrorMsg(errorMessage(e, "save failed"));
            }
            saveQueuedRef.current = false;
            return false;
          }

          // Lap done. If the latest snapshot already matches what we
          // just wrote, exit cleanly. Otherwise loop and persist the
          // newer snapshot too (a change came in mid-flight).
          const next = getLatestRef.current();
          if (!next || next.fp === savedFpRef.current) {
            saveQueuedRef.current = false;
            setStatus("saved");
            setErrorMsg(null);
            return true;
          }
          saveQueuedRef.current = false;
        }
      } finally {
        inflightRef.current = false;
        savePromiseRef.current = null;
      }
    })();

    savePromiseRef.current = task;
    return task;
  }, []);

  const debouncedSave = useDebounced(() => {
    void saveLatest();
  }, debounceMs);

  // ─── Public API ────────────────────────────────────────────────────
  const notifyChange = useCallback(() => {
    if (readOnlyRef.current) return;
    const snapshot = getLatestRef.current();
    if (!snapshot) return;

    // Cheap dedup: if the current snapshot matches the last persisted
    // content, drop the change. Without this, the editor's onChange
    // (which fires on cursor / selection / zoom / pan ticks for
    // Excalidraw, or on every drawio autosave reply) would queue a
    // save every 30s of canvas activity even when the user isn't
    // editing.
    if (snapshot.fp === savedFpRef.current) {
      if (inflightRef.current) {
        saveQueuedRef.current = true;
      } else {
        saveQueuedRef.current = false;
        debouncedSave.cancel();
        setStatus("saved");
        setErrorMsg(null);
      }
      return;
    }

    if (inflightRef.current) saveQueuedRef.current = true;
    setStatus((s) => (s === "saving" ? s : "dirty"));
    setErrorMsg(null);
    debouncedSave();
  }, [debouncedSave]);

  const saveNow = useCallback(async (): Promise<boolean> => {
    if (readOnlyRef.current) return true;
    debouncedSave.cancel();
    return saveLatest();
  }, [debouncedSave, saveLatest]);

  const discardPendingLocalWork = useCallback(() => {
    debouncedSave.cancel();
    saveQueuedRef.current = false;
    if (!inflightRef.current) {
      setStatus("saved");
      setErrorMsg(null);
    }
  }, [debouncedSave]);

  const reset = useCallback(
    (newVersion: number, newFingerprint: string) => {
      versionRef.current = newVersion;
      savedFpRef.current = newFingerprint;
      saveQueuedRef.current = false;
      savePromiseRef.current = null;
      debouncedSave.cancel();
      setStatus("saved");
      setErrorMsg(null);
    },
    [debouncedSave],
  );

  // ─── Browser unload guard ──────────────────────────────────────────
  // Live-ref the dirty flag so the listener doesn't re-bind on every
  // status tick.
  const isDirty = !readOnly && (status === "dirty" || status === "saving" || status === "error");
  const isDirtyRef = useRef(isDirty);
  useEffect(() => {
    isDirtyRef.current = isDirty;
  }, [isDirty]);

  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      debouncedSave.flush();
      if (isDirtyRef.current) {
        e.preventDefault();
        // Modern browsers ignore the string but require `returnValue`
        // to be set to anything to trigger their built-in prompt.
        e.returnValue = "";
      }
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") debouncedSave.flush();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("visibilitychange", onVisibility);
      debouncedSave.flush();
    };
  }, [debouncedSave]);

  return useMemo(
    () => ({
      status,
      errorMessage: errorMsg,
      isDirty,
      notifyChange,
      saveNow,
      discardPendingLocalWork,
      reset,
    }),
    [status, errorMsg, isDirty, notifyChange, saveNow, discardPendingLocalWork, reset],
  );
}
