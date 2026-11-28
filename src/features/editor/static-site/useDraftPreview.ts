// useDraftPreview — debounced `srcdoc` for the live (unsaved) preview.
// Returns null when there is nothing unsaved or the page can't be built;
// the caller then falls back to the signed saved URL.

import { useEffect, useRef, useState } from "react";
import { buildDraftHtml, PREVIEW_MSG } from "./draftPreview";
import { encodePath } from "./sitePaths";

export interface UseDraftPreviewArgs {
  enabled: boolean;
  /** Signed URL prefix (`/sites/:id/:sig/`). */
  prefix: string | null;
  version: number;
  /** HTML page shown in the preview. */
  pagePath: string;
  /** Unsaved text by path (edited + new files). */
  edits: Readonly<Record<string, string>>;
  /** Last known server text by path. */
  texts: Readonly<Record<string, string>>;
  /** Bumped by the reload button. */
  nonce: number;
  debounceMs?: number;
}

export function useDraftPreview({
  enabled,
  prefix,
  version,
  pagePath,
  edits,
  texts,
  nonce,
  debounceMs = 350,
}: UseDraftPreviewArgs): { srcDoc: string | null; building: boolean } {
  const [srcDoc, setSrcDoc] = useState<string | null>(null);
  const [building, setBuilding] = useState(false);
  const scrollRef = useRef(0);
  const fetched = useRef(new Map<string, string>());

  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      const d = e.data as { t?: unknown; y?: unknown } | null;
      if (d && d.t === PREVIEW_MSG && typeof d.y === "number") scrollRef.current = d.y;
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, []);

  // Reload resets the remembered scroll position.
  const lastNonce = useRef(nonce);

  useEffect(() => {
    if (!enabled || !prefix) {
      setSrcDoc(null);
      setBuilding(false);
      return;
    }
    if (lastNonce.current !== nonce) {
      lastNonce.current = nonce;
      scrollRef.current = 0;
    }
    const ctl = new AbortController();
    setBuilding(true);
    const t = setTimeout(async () => {
      try {
        let html: string | undefined = edits[pagePath] ?? texts[pagePath];
        if (html === undefined) {
          const key = `${version}:${pagePath}`;
          html = fetched.current.get(key);
          if (html === undefined) {
            const r = await fetch(`${prefix}${encodePath(pagePath)}?v=${version}`, {
              cache: "no-store",
              signal: ctl.signal,
            });
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            html = await r.text();
            fetched.current.set(key, html);
          }
        }
        const dir = pagePath.includes("/") ? pagePath.slice(0, pagePath.lastIndexOf("/") + 1) : "";
        const absolute = new URL(prefix + encodePath(dir), window.location.origin).href;
        const doc = buildDraftHtml({
          html,
          pagePath,
          baseHref: absolute,
          overrides: edits,
          scrollY: scrollRef.current,
        });
        if (!ctl.signal.aborted) {
          setSrcDoc(doc);
          setBuilding(false);
        }
      } catch {
        if (!ctl.signal.aborted) {
          setSrcDoc(null);
          setBuilding(false);
        }
      }
    }, debounceMs);
    return () => {
      clearTimeout(t);
      ctl.abort();
    };
  }, [enabled, prefix, version, pagePath, edits, texts, nonce, debounceMs]);

  return { srcDoc, building };
}
