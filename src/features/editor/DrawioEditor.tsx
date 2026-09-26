// DrawioEditor — drawio scene host.
//
// Architecture mirrors `ExcalidrawEditor`: an embedded drawio iframe
// (same-origin, served from `public/drawio`) we drive over the JSON
// postMessage protocol, with React portals injecting our chrome
// (logo, title, save-status control, host actions) into drawio's
// native menubar so it lives inside the iframe DOM and inherits
// drawio's typography/spacing.
//
// The save lifecycle (autosave + 409 retry + leave-confirm) lives in
// `./lifecycle/`; this file is the drawio-specific glue: iframe
// postMessage protocol, menubar slot management, theme-flip iframe
// remount, and the asynchronous thumbnail export pipeline that
// drawio's iframe drives via reply messages.
//
// File-level chrome (back, breadcrumb, name, save state, Share, ⋯
// menu) is rendered by the page above the iframe via
// `renderHeader(bridge)` — see `EditorHeader`. Inside the iframe we
// only inject the narrow-viewport sidebar toggles (Kennedy theme) and
// a stylesheet hiding drawio's own filename. drawio's blue Save
// button is suppressed via `noSaveBtn=1&saveAndExit=0`; the header's
// save indicator is the only Save surface.
//
// Drawio's dark mode follows `useTheme().resolved` via `?dark=1|0`.
// Theme flips force-save then bump a key on the iframe to remount it
// with the new value (no runtime toggle exists in the embed protocol).

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import type { DrawioFileBlob, LoadedFile } from "@/lib/api/client";
import { useDrawioStyle } from "@/lib/preferences";
import { type ResolvedTheme, useTheme } from "@/lib/theme";
import { DrawioSidebarToggles } from "./DrawioSidebarToggles";
import type { EditorHeaderBridge, RenderEditorHeader } from "./editorHeaderBridge";
import { LeaveConfirmDialog } from "./lifecycle/LeaveConfirmDialog";
import type { EditorSaveStatus } from "./lifecycle/types";
import { useDebounced } from "./lifecycle/useDebounced";
import { useLeaveConfirm } from "./lifecycle/useLeaveConfirm";
import { useSaveLifecycle } from "./lifecycle/useSaveLifecycle";

// Re-exported so callers using the legacy name keep building.
export type DrawioSaveStatus = EditorSaveStatus;

// LocalStorage key for the one-shot sketch touch hint. Cleared by
// the user implicitly when they pick a different Editor style and
// come back — the hint then fires again on first sketch render.
const SKETCH_HINT_KEY = "inkwell.drawio.touchHintShown";

type SaveFn = (version: number, blob: DrawioFileBlob) => Promise<{ version: number }>;

interface DrawioEditorProps {
  loaded: LoadedFile;
  save: SaveFn;
  /** Persists an SVG thumbnail to R2. `null` disables thumb upload
   *  (read-only sessions). Wired in Step 10. */
  saveThumb?: ((svg: string) => Promise<void>) | null;
  /** Called after a successful thumb upload so the dashboard can
   *  invalidate caches and pick up the new bust token. */
  onThumbSaved?: () => void;
  onReload?: (loaded: LoadedFile) => void;
  reload?: () => Promise<LoadedFile>;
  /** Renders the page header above the iframe (see `EditorHeader`). */
  renderHeader?: RenderEditorHeader;
}

interface DrawioMessage {
  event?: string;
  xml?: string;
  data?: string;
  format?: string;
  error?: string;
}

// 8s thumbnail debounce — used ONLY for the on-init backfill path
// (a file the server has no thumb for yet). Drawio needs a few
// seconds to render the loaded XML before an `xmlsvg` export reply
// returns useful SVG, so we wait. Edit-driven and save-driven thumbs
// don't go through this debounce: thumb generation is now coupled to
// `saveLatest`, which fires `requestThumbExport()` synchronously on
// every successful save.
const THUMB_DEBOUNCE_MS = 8_000;

// Cheap O(n) hash used to dedup thumb exports against the XML they were
// generated from. Same idea as the Excalidraw editor's fingerprint:
// avoid re-uploading an identical SVG when the user nudges a shape and
// then undoes it.
function hashXml(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16);
}

// Decode the `data` payload of a drawio `event: "export"` message.
// Drawio sends one of two forms depending on internal flags we don't
// control:
//   - raw SVG XML string (`<svg …>…</svg>`)
//   - data URL: `data:image/svg+xml;base64,<base64>`
// Returns the SVG XML string in both cases, or `null` if the payload
// is empty / malformed.
function decodeDrawioSvgPayload(data: string | undefined): string | null {
  if (!data) return null;
  const prefix = "data:image/svg+xml;base64,";
  if (data.startsWith(prefix)) {
    try {
      // `atob` returns a binary-encoded string; SVG is ASCII (the XML
      // header is `<?xml version="1.0" encoding="UTF-8"?>`), but if the
      // diagram contains non-ASCII labels drawio percent-encodes them
      // before base64. Decode via TextDecoder so emoji etc. survive.
      const binary = atob(data.slice(prefix.length));
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      return new TextDecoder("utf-8").decode(bytes);
    } catch {
      return null;
    }
  }
  return data.startsWith("<") ? data : null;
}

// `noSaveBtn=1&saveAndExit=0` suppresses drawio's own embed Save
// button — we render the only Save surface via the combined status
// control. `dark` is appended at runtime so the iframe boots into the
// right theme; flips are handled by remounting the iframe (see the
// `iframeKey`-bumping effect below) since the embed protocol has no
// runtime dark-mode toggle. `style="sketch"` adds `&ui=sketch` which
// switches drawio to its touch-first floating UI; the embed protocol
// (`installMessageHandler`) is theme-agnostic so save / load /
// export work identically.
function buildDrawioSrc(dark: boolean, style: "classic" | "sketch"): string {
  const ui = style === "sketch" ? "&ui=sketch" : "";
  return `/drawio/index.html?embed=1&proto=json&spin=1&libraries=1&noExitBtn=1&noSaveBtn=1&saveAndExit=0&dark=${dark ? 1 : 0}${ui}`;
}

// Slot we inject into drawio's `.geMenubarContainer` (Kennedy only),
// rendered into via a React portal. Same-origin iframe (we serve
// `public/drawio` ourselves) is what makes this safe. `trailing` hosts
// Tier 2's sidebar/format toggles — visible only on
// `(max-width: 1024px)` so it's a no-op on desktop. Sketch has no use
// for it (drawio's floating shape picker / format button cover it).
interface DrawioMenubarSlots {
  trailing: HTMLDivElement | null;
}

// Stylesheet injected into the iframe document (menubar tweaks,
// narrow-viewport toolbar scrolling, sidebar toggles, and hiding
// drawio's own filename — the header shows it). All colours use
// `light-dark()` so they follow drawio's `geDarkMode` body class.
const MENUBAR_STYLE_ID = "inkwell-drawio-menubar-style";
const MENUBAR_CSS = `
/* Kennedy (classic) theme: drawio's native compact 30px menubar is
   kept as-is — the file name, save state and host actions live in
   Inkwell's EditorHeader above the iframe. */
/* Drawio renders the filename in two places (.geStatusDiv in the
   menubar container, .geStatus at the end of .geMenubar); the
   EditorHeader already shows it, so both are hidden. */
.geMenubarContainer > .geStatusDiv,
.geMenubarContainer > .geMenubar > .geStatus {
  display: none !important;
}

/* Toolbar horizontal-scroll on narrow viewports. Drawio's own
   hideToolbarElements (grapheditor/EditorUi.js:543) reads each
   button's data-min-width attribute and sets display:none via
   inline style when window.innerWidth is below the threshold (1050
   for embed mode), which clips 16/28 buttons at <=1024px with no
   way to reach them. We override the inline display:none with
   !important and let the toolbar scroll horizontally instead.
   Sketch theme has no .geCompactMode and is unaffected. */
@media (max-width: 1024px) {
  .geEditor.geCompactMode > .geToolbarContainer {
    overflow-x: auto;
    overflow-y: hidden;
    scrollbar-width: thin;
    -webkit-overflow-scrolling: touch;
    padding-bottom: 2px;
  }
  .geEditor.geCompactMode > .geToolbarContainer::-webkit-scrollbar {
    height: 4px;
  }
  /* Re-show every toolbar item drawio hid via inline style. The
     inner .geToolbar is flex; restoring children to display:flex
     keeps icon centring intact. Separators stay block. */
  .geEditor.geCompactMode > .geToolbarContainer > .geToolbar > .geButton {
    display: flex !important;
  }
  .geEditor.geCompactMode > .geToolbarContainer > .geToolbar > .geSeparator {
    display: block !important;
  }
  /* The zoom-percent dropdown on the leading edge has its own
     wrapper with width:auto; keep it visible too. */
  .geEditor.geCompactMode > .geToolbarContainer > .geToolbar > .geZoomInput {
    display: flex !important;
  }
}

/* Touch-target bumps for page tabs along the bottom edge. */
@media (pointer: coarse) {
  .geTabContainer { min-height: 40px; }
  .geTabContainer .geTab,
  .geTabContainer .geButton { min-height: 36px; padding: 4px 10px; }
}

/* Tier 2 sidebar toggles — pinned to the right edge of drawio's
   menubar row. Empty (display:none) on desktop; visible only at
   narrow viewports where drawio's smallScreenWidth=1024 collapses
   both side panels. The buttons drive drawio's own toggle actions
   via the contentWindow.editorUi handles, with aria-pressed
   mirroring drawio's actual panel state via MutationObserver. */
.inkwell-trailing-container {
  /* fixed (to the iframe viewport), not absolute: drawio sizes the
     menubar container wider than the viewport on phones. */
  position: fixed;
  top: 0;
  right: max(8px, env(safe-area-inset-right));
  height: 30px;
  display: none;
  align-items: center;
  gap: 4px;
  z-index: 1;
}
@media (max-width: 1024px) {
  .inkwell-trailing-container { display: flex; }
}
.inkwell-toggle-btn {
  all: unset;
  width: 32px;
  height: 32px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  cursor: pointer;
  color: light-dark(rgba(15, 23, 42, 0.7), rgba(241, 245, 249, 0.7));
}
.inkwell-toggle-btn:hover {
  background-color: light-dark(rgba(0, 0, 0, 0.06), rgba(255, 255, 255, 0.08));
}
.inkwell-toggle-btn[data-pressed="true"] {
  background-color: light-dark(rgba(0, 0, 0, 0.10), rgba(255, 255, 255, 0.14));
  color: light-dark(#0f172a, #f1f5f9);
}
.inkwell-toggle-btn svg {
  width: 18px;
  height: 18px;
}
@media (pointer: coarse) {
  .inkwell-toggle-btn { width: 36px; height: 36px; }
  .inkwell-toggle-btn svg { width: 20px; height: 20px; }
}

/* Sketch theme (body.geSketch, ui=sketch): the file name lives in
   Inkwell's EditorHeader, so drawio's own filename status is hidden. */
/* .geStatusDiv inside .geButtonContainer is where sketch renders
   the file name. The whole sketchMenubarElt becomes empty in
   embed mode (no comments / share / format buttons appended) so
   we hide it entirely to avoid a stray dark pill at top-right.
   Targeted via the inline-style flex set by drawio's JS so we beat
   future style writes (e.g., on resize). */
body.geSketch .geToolbarContainer > .geButtonContainer > .geStatusDiv {
  display: none !important;
}
body.geSketch .geToolbarContainer[style*="position: absolute"][style*="right: 12px"] {
  display: none !important;
}
`;

// Style-aware slot resolver. Kennedy injects the trailing toggles
// into `.geMenubarContainer`; sketch only needs the stylesheet.
function ensureSlots(
  iframe: HTMLIFrameElement,
  style: "classic" | "sketch",
): DrawioMenubarSlots | null {
  const doc = iframe.contentDocument;
  if (!doc) return null;
  if (style === "sketch") {
    ensureStylesheet(doc);
    return { trailing: null };
  }
  const menubar = doc.querySelector<HTMLDivElement>(".geMenubarContainer");
  if (!menubar) return null;
  ensureStylesheet(doc);
  let trailing = menubar.querySelector<HTMLDivElement>(".inkwell-trailing-container");
  if (!trailing) {
    trailing = doc.createElement("div");
    trailing.className = "inkwell-trailing-container";
    menubar.appendChild(trailing);
  }
  return { trailing };
}

function ensureStylesheet(doc: Document) {
  if (doc.getElementById(MENUBAR_STYLE_ID)) return;
  const style = doc.createElement("style");
  style.id = MENUBAR_STYLE_ID;
  style.textContent = MENUBAR_CSS;
  doc.head.appendChild(style);
}

export default function DrawioEditor({
  loaded,
  save,
  saveThumb,
  onThumbSaved,
  onReload,
  reload,
  renderHeader,
}: DrawioEditorProps) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const readOnly = loaded.permission !== "write";
  const initialXml = getDrawioXml(loaded);

  // Latest XML pushed by drawio's `autosave` / `save` reply messages.
  // The lifecycle hook reads this through `getLatest()`.
  const latestXmlRef = useRef(initialXml);
  // Most recently shipped thumbnail XML hash (dedup against the live
  // editor state, not against `savedXml` — drawio renders whatever is
  // on the canvas, not necessarily what we last persisted).
  const thumbFpRef = useRef<string | null>(null);
  // The XML we just asked drawio to export. Stale replies (user kept
  // editing while the export was in flight) are filtered against this.
  const pendingThumbXmlRef = useRef<string | null>(null);
  const previousFileIdRef = useRef(loaded.meta.id);

  const [ready, setReady] = useState(false);
  const [slots, setSlots] = useState<DrawioMenubarSlots | null>(null);
  const { resolved } = useTheme();
  const lastResolvedRef = useRef<ResolvedTheme>(resolved);
  const drawioStyle = useDrawioStyle();

  const targetOrigin = useMemo(() => window.location.origin, []);
  const drawioSrc = useMemo(
    () => buildDrawioSrc(resolved === "dark", drawioStyle),
    [resolved, drawioStyle],
  );
  // Track the active style so we can remount the iframe when the
  // user's pref changes — same mechanism as the dark-mode flip below.
  const lastStyleRef = useRef(drawioStyle);

  const post = useCallback(
    (message: Record<string, unknown>) => {
      iframeRef.current?.contentWindow?.postMessage(JSON.stringify(message), targetOrigin);
    },
    [targetOrigin],
  );

  // Ask drawio to export the current diagram as SVG. The reply lands
  // in the `onMessage` handler as `{ event: 'export', format: 'svg',
  // data: … }` (drawio rewrites our `xmlsvg` request to `svg` on the
  // reply) and we then PUT it to /api/files/:id/thumb.
  //
  // We don't pass `format: 'svg'` because some drawio builds gate
  // plain SVG export through their server-side render pipeline;
  // `'xmlsvg'` always runs locally inside the iframe via
  // `Graph.getSvg()`. The resulting SVG embeds the source XML, but for
  // a 200x150 thumbnail the byte cost is irrelevant and the
  // round-trip-safe form is the safer default.
  const requestThumbExport = useCallback(() => {
    if (!saveThumb || readOnly) return;
    const xml = latestXmlRef.current;
    if (!xml) return;
    const fp = hashXml(xml);
    if (fp === thumbFpRef.current) return; // already uploaded this content
    pendingThumbXmlRef.current = xml;
    post({
      action: "export",
      format: "xmlsvg",
      // Suppress the spinner overlay drawio shows during long exports.
      // Thumbnail exports are sub-50ms; the spinner would just flash.
      spin: "",
      // Always render thumbnails with drawio's light stylesheet — the
      // dashboard adapts to dark mode via `.dark .ink-thumb-img`'s
      // invert/hue-rotate filter (see src/index.css). Matching the
      // Excalidraw thumbnail pipeline (`exportBackground: false` +
      // light-themed strokes) keeps both editors on the same contract
      // and avoids double-inversion on dark dashboards. Without this
      // override drawio's embed export resolves the theme to "auto"
      // when the editor is in dark mode and bakes the dark stylesheet
      // (dark canvas + colour-shifted shapes) into the SVG.
      theme: "light",
    });
  }, [post, readOnly, saveThumb]);

  const debouncedThumb = useDebounced(requestThumbExport, THUMB_DEBOUNCE_MS);

  const lifecycle = useSaveLifecycle<DrawioFileBlob, LoadedFile>({
    initialVersion: loaded.meta.version,
    initialFingerprint: hashXml(initialXml),
    readOnly,
    transport: { save, reload },
    getLatest: () => {
      const xml = latestXmlRef.current;
      if (!xml) return null;
      return { fp: hashXml(xml), blob: { kind: "drawio", xml } };
    },
    onSaved: () => {
      // Schedule a thumb export after every successful save. The
      // export reply comes back asynchronously via the iframe's
      // `message` event; `requestThumbExport` self-dedups on
      // `thumbFpRef` so a no-content-change save short-circuits.
      requestThumbExport();
    },
    onReload: (fresh) => {
      // Drawio's iframe holds the canonical canvas state; pushing the
      // fresh XML in restores parity. The lifecycle has already
      // updated its internal versionRef.
      const freshXml = getDrawioXml(fresh);
      latestXmlRef.current = freshXml;
      post({
        action: "load",
        xml: freshXml,
        autosave: readOnly ? 0 : 1,
        title: fresh.meta.name,
        noSaveBtn: 1,
        noExitBtn: 1,
      });
      onReload?.(fresh);
    },
  });

  useEffect(() => {
    const fileChanged = previousFileIdRef.current !== loaded.meta.id;
    previousFileIdRef.current = loaded.meta.id;
    latestXmlRef.current = initialXml;
    if (fileChanged) {
      // Different file → the previous file's thumb fingerprint is
      // meaningless. Drop it so the next edit triggers a fresh export.
      thumbFpRef.current = null;
      pendingThumbXmlRef.current = null;
      // Reset readiness only for a different file. Parent save
      // callbacks update `loaded.meta.version` after every successful
      // PUT; resetting readiness on those version bumps would leave
      // the iframe loaded while our status falls back to "Loading…".
      setReady(false);
      setSlots(null);
    }
    lifecycle.reset(loaded.meta.version, hashXml(initialXml));
    // `lifecycle.reset` is stable across renders (useCallback'd
    // against stable refs), so depending on it is harmless.
  }, [initialXml, loaded.meta.id, loaded.meta.version, lifecycle.reset]);

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin) return;
      if (event.source !== iframeRef.current?.contentWindow) return;
      if (typeof event.data !== "string") return;

      let msg: DrawioMessage;
      try {
        msg = JSON.parse(event.data) as DrawioMessage;
      } catch {
        return;
      }

      if (msg.event === "init") {
        setReady(true);
        // Set up native menubar slots once drawio has rendered its UI.
        // `init` fires after the menubar exists in the DOM.
        if (iframeRef.current) {
          const next = ensureSlots(iframeRef.current, drawioStyle);
          if (next) setSlots(next);
        }
        post({
          action: "load",
          xml: latestXmlRef.current,
          autosave: readOnly ? 0 : 1,
          title: loaded.meta.name,
          noSaveBtn: 1,
          noExitBtn: 1,
        });
        // Backfill: if the server has no thumb for this file yet,
        // schedule one so opening an existing file (no edits required)
        // generates a preview. The 8s debounce gives drawio time to
        // render the loaded XML before we ask for an SVG export.
        // Gated on `!hasThumb` so we don't bump `thumb_updated_at`
        // (and bust the CF cache) on every open of a file that
        // already has a recent thumb.
        if (!loaded.meta.hasThumb && !readOnly && saveThumb) {
          debouncedThumb();
        }
        return;
      }

      if ((msg.event === "autosave" || msg.event === "save") && typeof msg.xml === "string") {
        if (readOnly) return;
        latestXmlRef.current = msg.xml;
        // `save` events are explicit user-triggered saves (Cmd-S in
        // drawio) — bypass the 30s debounce so they go to the server
        // immediately. `autosave` events are drawio's debounced
        // change ticks; route them through our own debouncer.
        if (msg.event === "save") void lifecycle.saveNow();
        else lifecycle.notifyChange();
        return;
      }

      // Thumb export reply. Honour only the export we asked for and
      // skip stale replies (user kept editing while the export was in
      // flight) by comparing fingerprints against `pendingThumbXmlRef`.
      if (msg.event === "export" && (msg.format === "xmlsvg" || msg.format === "svg")) {
        const expectedXml = pendingThumbXmlRef.current;
        pendingThumbXmlRef.current = null;
        if (!saveThumb || !expectedXml) return;
        const svg = decodeDrawioSvgPayload(msg.data);
        if (!svg) return;
        const fp = hashXml(expectedXml);
        if (fp === thumbFpRef.current) return;
        // Optimistically mark the fingerprint as shipped so concurrent
        // saves don't queue a duplicate while the PUT is in flight.
        // Roll it back if the PUT fails.
        const previousFp = thumbFpRef.current;
        thumbFpRef.current = fp;
        void saveThumb(svg)
          .then(() => onThumbSaved?.())
          .catch(() => {
            thumbFpRef.current = previousFp;
          });
      }
    }

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [
    debouncedThumb,
    drawioStyle,
    lifecycle,
    loaded.meta.hasThumb,
    loaded.meta.name,
    onThumbSaved,
    post,
    readOnly,
    saveThumb,
  ]);

  // Iframe resize ping — iOS Safari hides its address bar on scroll
  // which changes the available viewport height. Drawio re-measures
  // its container on the documented `resize` action; without this
  // ping the canvas leaves a gap under the new viewport.
  useEffect(() => {
    const onResize = () => post({ action: "resize" });
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [post]);

  // First-time sketch hint — fired once per device, persisted via
  // localStorage. Sketch's touch gestures (pinch-zoom, two-finger
  // pan, long-press) aren't obvious from the floating chrome alone,
  // so a single-shot toast nudges users in the right direction.
  useEffect(() => {
    if (drawioStyle !== "sketch" || !ready) return;
    try {
      if (localStorage.getItem(SKETCH_HINT_KEY) === "1") return;
      localStorage.setItem(SKETCH_HINT_KEY, "1");
    } catch {
      /* storage unavailable — hint will fire again next session, harmless */
    }
    toast("Touch tips", {
      description: "Pinch to zoom · Two-finger drag to pan · Long-press a shape for options.",
      duration: 7000,
    });
  }, [drawioStyle, ready]);

  // Theme / style flip — drawio's embed protocol has no runtime
  // dark-mode or theme toggle, so we force-save the current XML,
  // drop our slot refs, and let the keyed iframe (below) remount
  // with the new `dark=` / `ui=` URL params. The save is
  // fire-and-forget — by the time the new iframe boots, the PUT has
  // either landed (canonical XML) or surfaced an error via the
  // existing status path.
  useEffect(() => {
    const themeChanged = lastResolvedRef.current !== resolved;
    const styleChanged = lastStyleRef.current !== drawioStyle;
    if (!themeChanged && !styleChanged) return;
    lastResolvedRef.current = resolved;
    lastStyleRef.current = drawioStyle;
    // Cancel any pending thumb export — the iframe is about to remount
    // and any in-flight export reply would arrive against a stale
    // session. The next save after the remount will queue a fresh one.
    debouncedThumb.cancel();
    pendingThumbXmlRef.current = null;
    void lifecycle.saveNow();
    setReady(false);
    setSlots(null);
  }, [resolved, drawioStyle, debouncedThumb, lifecycle]);

  // Flush the on-init thumb backfill on `beforeunload` /
  // `visibilitychange` so a user who opens a file (no thumb yet) and
  // leaves before 8s elapses still ends up with a preview.
  // Save-driven thumbs are already triggered synchronously from
  // `useSaveLifecycle`'s onSaved callback above; the editor save
  // lifecycle already handles its own beforeunload flush via
  // `useSaveLifecycle`.
  useEffect(() => {
    const onBeforeUnload = () => {
      debouncedThumb.flush();
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") debouncedThumb.flush();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("visibilitychange", onVisibility);
      // On unmount we cancel — a pending thumb export may already
      // have posted to the iframe; its reply would land after we're
      // gone and there's no listener to handle it. Better to skip
      // than to upload a half-stale preview.
      debouncedThumb.cancel();
    };
  }, [debouncedThumb]);

  // ─── In-app navigation guard ─────────────────────────────────────
  const leave = useLeaveConfirm({
    isDirty: lifecycle.isDirty,
    saveNow: lifecycle.saveNow,
    discardPendingLocalWork: () => {
      // Drop pending edits — the parent will unmount this component
      // on navigation, releasing latestXmlRef along with everything
      // else.
      latestXmlRef.current = "";
      lifecycle.discardPendingLocalWork();
    },
  });

  const { saveNow, discardPendingLocalWork } = lifecycle;
  const { requestLeave } = leave;
  const bridge = useMemo<EditorHeaderBridge>(
    () => ({
      status: readOnly ? null : !ready ? "loading" : lifecycle.status,
      errorMessage: lifecycle.errorMessage,
      saveNow: readOnly ? null : () => void saveNow(),
      flush: saveNow,
      discard: discardPendingLocalWork,
      requestLeave,
    }),
    [
      readOnly,
      ready,
      lifecycle.status,
      lifecycle.errorMessage,
      saveNow,
      discardPendingLocalWork,
      requestLeave,
    ],
  );

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-background">
      {renderHeader?.(bridge)}
      <div className="relative min-h-0 w-full flex-1">
        <iframe
          // Remount when the resolved theme OR style changes so drawio
          // re-reads `?dark=` / `?ui=`. Cheap because it's only on
          // explicit user toggles.
          key={`${resolved}|${drawioStyle}`}
          ref={iframeRef}
          src={drawioSrc}
          title="draw.io editor"
          className="h-full w-full border-0"
          allow="clipboard-read; clipboard-write"
        />
      </div>

      {/* Trailing slot — Kennedy only. Hosts the Tier 2 sidebar
          toggles (visible only below 1024px via CSS). */}
      {slots?.trailing
        ? createPortal(<DrawioSidebarToggles iframe={iframeRef.current} />, slots.trailing)
        : null}

      <LeaveConfirmDialog
        open={leave.open}
        busy={leave.busy}
        onOpenChange={leave.onOpenChange}
        onDiscard={leave.discard}
        onSaveAndLeave={() => void leave.saveAndLeave()}
      />
    </div>
  );
}

function getDrawioXml(loaded: LoadedFile): string {
  const blob = loaded.blob as Partial<DrawioFileBlob>;
  return typeof blob.xml === "string" ? blob.xml : "";
}
