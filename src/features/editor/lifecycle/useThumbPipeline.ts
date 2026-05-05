// Thumbnail upload dedup helper.
//
// Both editors keep a fingerprint of the last successfully uploaded
// thumbnail (`thumbFpRef`) so a no-content-change save doesn't re-PUT
// an identical SVG. This hook owns that ref and the standard
// fire-and-forget try/catch around the SVG export + upload.
//
// Excalidraw renders the SVG synchronously (Excalidraw's
// `exportToSvg` returns a value the editor uploads). Drawio renders
// it asynchronously via the iframe's `export` reply, so it doesn't
// fit this `request(fp, render)` contract — Drawio keeps its own
// dedup ref in `DrawioEditor.tsx`. This hook is intentionally
// Excalidraw-shaped.

import { useCallback, useRef } from "react";

export interface UseThumbPipelineOptions {
  /** Persists an SVG. Pass `null` on read-only sessions to disable
   *  the pipeline entirely. */
  saveThumb: ((svg: string) => Promise<void>) | null;
  /** Called after each successful upload so the parent can invalidate
   *  caches and refresh the explorer thumbnails. */
  onThumbSaved?: () => void;
  readOnly: boolean;
}

export interface UseThumbPipelineResult {
  /** Schedule an upload. `render` is awaited only when the fingerprint
   *  doesn't match the last shipped one. Errors are swallowed. */
  request: (fp: string, render: () => Promise<string | null>) => void;
  /** Wipe the dedup cache (e.g. after the parent loads a different
   *  file). */
  reset: () => void;
}

export function useThumbPipeline(opts: UseThumbPipelineOptions): UseThumbPipelineResult {
  const { saveThumb, onThumbSaved, readOnly } = opts;
  const fpRef = useRef<string | null>(null);

  // Capture the latest closures so `request` stays stable across renders.
  const saveThumbRef = useRef(saveThumb);
  saveThumbRef.current = saveThumb;
  const onSavedRef = useRef(onThumbSaved);
  onSavedRef.current = onThumbSaved;
  const readOnlyRef = useRef(readOnly);
  readOnlyRef.current = readOnly;

  const request = useCallback((fp: string, render: () => Promise<string | null>) => {
    if (!saveThumbRef.current || readOnlyRef.current) return;
    if (fp === fpRef.current) return;
    void (async () => {
      try {
        const svg = await render();
        if (!svg) return;
        const upload = saveThumbRef.current;
        if (!upload) return;
        await upload(svg);
        fpRef.current = fp;
        onSavedRef.current?.();
      } catch {
        // Best-effort.
      }
    })();
  }, []);

  const reset = useCallback(() => {
    fpRef.current = null;
  }, []);

  return { request, reset };
}
