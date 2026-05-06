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
// Header layout follows diagrams.net's natural Kennedy-theme chrome:
// a 60px two-row container with the brand mark, the scene title +
// status, and drawio's own File/Edit/View menubar at the bottom row.
// Layout is a single flex row at the top so the title can shrink to
// fit narrow viewports without overlapping anything (the previous
// absolute-positioned layout reserved a fixed right gutter that
// truncated the filename to one character on phones — see
// docs/drawio-responsive-audit.md).
//
// Host actions (Tags / Share / Download) used to render in the top-
// right of this strip; they're now injected into drawio's File menu
// via `installFileMenuExtras` (Tier 1.4 of the responsive plan), so
// the strip contains brand + filename + save-status only and stays
// readable from 320px up.
//
// The combined save-status control mirrors `SceneTopLeftStrip`:
// dirty=floppy, saving=spinner, saved=check, error=alert (clickable
// retry), readonly=eye. It is the only Save surface — drawio's own
// blue Save button is suppressed via `noSaveBtn=1&saveAndExit=0`.
//
// Drawio's dark mode follows `useTheme().resolved` via `?dark=1|0`.
// Theme flips force-save then bump a key on the iframe to remount it
// with the new value (no runtime toggle exists in the embed protocol).

import {
  Alert02Icon,
  CheckmarkCircle02Icon,
  EyeIcon,
  FloppyDiskIcon,
  Loading03Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { InkwellMark } from "@/components/InkwellMark";
import type { DrawioFileBlob, LoadedFile } from "@/lib/api/client";
import { useDrawioStyle } from "@/lib/preferences";
import { type ResolvedTheme, useTheme } from "@/lib/theme";
import { DrawioSidebarToggles } from "./DrawioSidebarToggles";
import { type FileMenuExtraHandlers, installFileMenuExtras } from "./installFileMenuExtras";
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
  back?: { onClick: () => void; label: string } | null;
  onRequestRename?: () => void;
  /**
   * Items appended to drawio's native File menu. Replaces the
   * legacy `actions` portal, which rendered host buttons in the
   * menubar's top-right and broke at narrow viewport widths
   * (truncated the filename, no overflow handling). The File menu
   * is the canonical home for these in both Kennedy and sketch
   * themes (sketch's hamburger surfaces the File menu directly).
   */
  fileMenuExtras?: FileMenuExtraHandlers;
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

// Slots we inject into drawio's `.geMenubarContainer`. Rendered into via
// React portals so the chrome lives natively inside the iframe DOM and
// inherits drawio's menubar typography/colors. Same-origin iframe (we
// serve `public/drawio` ourselves) is what makes this safe.
//
// `trailing` is a narrow zone on the right edge used by Tier 2's
// sidebar/format toggles — visible only on `(max-width: 1024px)` so
// it's a no-op on desktop. The previous host-actions slot (Tags /
// Share / Download) is gone; those items moved to drawio's File menu
// via `installFileMenuExtras`.
interface DrawioMenubarSlots {
  appIcon: HTMLDivElement;
  /**
   * Filename + save-status host. Both Kennedy and sketch render
   * the filename + save-status inline here; sketch slots it into
   * `sketchMainMenuElt` between the brand and the hamburger so the
   * scene title is colocated with the rest of the chrome (drawio's
   * own `.geStatus` filename in `sketchMenubarElt` is hidden via
   * the menubar stylesheet).
   */
  filename: HTMLDivElement;
  /**
   * Right-edge slot used by Kennedy's sidebar/format toggles
   * (visible only on `(max-width: 1024px)`). Sketch has no use for
   * it since drawio's own floating shape picker / format-panel
   * button cover the same role, so it's `null` in sketch and the
   * portal is skipped.
   */
  trailing: HTMLDivElement | null;
}

// Stylesheet injected into the iframe document. The natural Kennedy
// chrome we want is `.geMenubarContainer { height: 60px }` with
// `.geMenubar { top: 28px; padding-left: 58px }` and an absolutely-
// positioned `.geFilenameContainer` at `top: 4` (declared in
// `public/drawio/styles/grapheditor.css`). However, `App.js:1891`
// force-enables compact mode for Kennedy+embed, applying the
// `.geCompactMode > .geMenubarContainer { height: 30px }` and
// `.geCompactMode > .geMenubarContainer > .geMenubar { top: 0;
// padding-left: 4px }` overrides that collapse the chrome into a
// single 30px row. We undo those compact-mode overrides below to
// restore the diagrams.net 2-row layout. In embed mode drawio also
// skips creating the logo and filename slots (`App.js:7651` /
// `:7683`), so we inject equivalents with the same rectangles. All
// colours use `light-dark()` so they automatically follow drawio's
// `geDarkMode` body class.
//
// Layout: the chrome is a 2×3 CSS Grid. Brand icon spans both rows
// in column 1; filename + status sit in (col 2, row 1); trailing
// sidebar toggles sit in (col 3, row 1); drawio's own .geMenubar
// (File / Edit / View / …) is forced to `position: static` and
// placed at (col 2/3, row 2) so it sizes to its content instead of
// the 1228px-wide absolute strip drawio's stock CSS produces. This
// is the layout primitive that actually fits the design — earlier
// revisions mimicked it via `display: flex` on the container plus
// drawio's stock `position: absolute` on the menubar, which left
// two giant overlapping empty rectangles behind the chrome (very
// visible when inspecting either element in DevTools).
const MENUBAR_STYLE_ID = "inkwell-drawio-menubar-style";
const MENUBAR_CSS = `
/* Restore the natural Kennedy 2-row chrome but tightened from the
   stock 60px down to 52px. The math is anchored on drawio's own
   .geMenubar (File/Edit/View) which is a fixed 30px-tall row — we
   can't shrink that without breaking drawio's button hit areas, so
   the savings come entirely from the title row (24px → 22px) and
   the bottom gap (vanishes; the 30px menubar runs to y=52 with no
   trailing breathing room — drawio's toolbar below has its own
   internal padding so this still reads cleanly).

   Layout primitive: 2×3 CSS Grid. The earlier flex+absolute hybrid
   (flex container with brand/filename/trailing as flex children
   plus drawio's stock 'position: absolute' menubar layered on top)
   left two giant overlapping empty rectangles — the filename slot
   grew to fill the row's free space and the menubar always spanned
   100% width — visible whenever either was inspected. Grid lets
   each cell size to its content, so the chrome is exactly as wide
   as what's actually drawn.

     col 1 (auto):           brand mark, spans rows 1+2
     col 2 (minmax(0,1fr)):  filename slot (row 1), menubar (row 2)
     col 3 (auto):           trailing sidebar toggles (row 1 only)

     row 1 (22px): title + save status
     row 2 (30px): drawio File/Edit/View/Arrange/Extras/Help

   Glyph alignment between the title (row 1) and File menu (row 2)
   is now intrinsic: both items live in the same grid column, so
   their left edges coincide automatically. We just match the inner
   padding (8px on .inkwell-drawio-title-text, 8px on .geMenubar a)
   so the first glyph lands at the same x in both rows. */
.geEditor.geCompactMode > .geMenubarContainer {
  height: 52px !important;
  margin-top: 0 !important;
  display: grid !important;
  grid-template-columns: auto minmax(0, 1fr) auto;
  grid-template-rows: 22px 30px;
  align-items: center;
  column-gap: 12px;
  row-gap: 0;
  padding-left: max(16px, env(safe-area-inset-left)) !important;
  padding-right: max(12px, env(safe-area-inset-right)) !important;
}
/* Drawio's stock CSS positions .geMenubar absolutely inside the
   container; we override that so the menubar participates in the
   grid as a normal item in (col 2/3, row 2). justify-self: start
   keeps it sized to its content (the six menu items) instead of
   spanning the full row. !important is needed against drawio's
   compact-mode override (.geCompactMode > .geMenubarContainer >
   .geMenubar) which sets 'position: absolute; top: 0'. */
.geEditor.geCompactMode > .geMenubarContainer > .geMenubar {
  position: static !important;
  top: auto !important;
  left: auto !important;
  /* Drawio's stock .geMenubar { width: 100% } would beat justify-self,
     so we shrink-to-fit explicitly. The result is exactly the six
     menu items wide; no trailing empty strip. */
  width: max-content !important;
  grid-column: 2 / span 2;
  grid-row: 2;
  justify-self: start;
  padding-left: 0 !important;
  padding-right: 0 !important;
}
/* Drawio renders the filename in two places we don't want:
   - <div class="geStatusDiv"> as a direct child of the menubar
     container (the visible one in non-compact mode, still inserted
     in compact+embed). Without hiding it, it sits as a stray grid
     item at the right edge of row 1 showing the filename a second
     time — our injected .inkwell-filename-container already shows
     the filename in row 1, so this is a duplicate.
   - <a class="geStatus"> appended at the end of .geMenubar (would
     normally be the filename slot in the non-embed build). With
     the menubar shrunk to max-content this stub would otherwise
     extend the menubar's effective content width. */
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

/* Brand mark — column 1 of the grid, spanning both rows so it
   visually bridges the title row (top) and the File/Edit/View menu
   row (bottom), the same role drawio's native orange .geAppIcon
   plays. Sized 28×32 with a 22×22 svg to match the tightened
   52px chrome. */
.inkwell-app-icon {
  position: relative;
  grid-column: 1;
  grid-row: 1 / span 2;
  align-self: center;
  width: 28px;
  height: 32px;
  color: light-dark(#1f2937, #e5e7eb);
  user-select: none;
}
.inkwell-app-icon > button,
.inkwell-app-icon > div {
  all: unset;
  display: grid;
  place-items: center;
  width: 100%;
  height: 100%;
  border-radius: 4px;
  color: inherit;
}
.inkwell-app-icon > button {
  cursor: pointer;
}
.inkwell-app-icon > button:hover {
  background-color: light-dark(rgba(0, 0, 0, 0.06), rgba(255, 255, 255, 0.08));
}
.inkwell-app-icon svg {
  width: 22px;
  height: 22px;
}

/* Filename + save-status row — column 2 of the grid, row 1.
   justify-self: start sizes the slot to its content (title +
   status icon) instead of stretching to fill the column — keeps
   the DOM rectangle honest. max-width: 100% then caps it at the
   grid column width when the title gets too long, so the title
   ellipsizes against the column at narrow viewports (the
   minmax(0, 1fr) column on the container shrinks to fit the
   viewport, dragging max-width: 100% down with it).
   Tightened from drawio's natural 26px / 18px text down to 20px /
   14px text so the chrome reads as a single compact band. */
.inkwell-filename-container {
  position: relative;
  grid-column: 2;
  grid-row: 1;
  justify-self: start;
  max-width: 100%;
  min-width: 0;
  height: 20px;
  display: flex;
  align-items: center;
  gap: 6px;
}
.inkwell-drawio-title-text {
  all: unset;
  font-size: 14px;
  font-weight: 600;
  font-family: inherit;
  line-height: 1.2;
  color: light-dark(#0f172a, #f1f5f9);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  /* 8px horizontal padding matches drawio's .geMenubar a
     padding-left, so the title's first glyph sits at the same x as
     the File menu item's first glyph below. Both share grid column
     2 — the alignment is intrinsic and survives any change to the
     brand width or column gap. */
  padding: 1px 8px;
  border-radius: 4px;
  min-width: 0;
  max-width: 100%;
}
.inkwell-drawio-title-text[data-clickable="true"] {
  cursor: text;
}
.inkwell-drawio-title-text[data-clickable="true"]:hover {
  background-color: light-dark(rgba(0, 0, 0, 0.06), rgba(255, 255, 255, 0.08));
}
.inkwell-drawio-title-text:disabled {
  cursor: default;
}
/* Phone-class viewports: hide filename text but keep the save-status
   icon (which still needs to be glanceable). The page title is
   still in the browser tab. Sketch theme also gates this via the
   media query, so phones on either theme behave the same. */
@media (max-width: 480px) {
  .inkwell-drawio-title-text { display: none; }
}

/* Combined save-status icon button. Tone is driven by data-tone;
   spinning state by data-spinning. Tailwind classes from the parent
   document don't apply inside the iframe — colours/animation are
   declared here. Sized 20×20 to fit the tightened title row. */
.inkwell-status-btn {
  all: unset;
  width: 20px;
  height: 20px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  flex: 0 0 auto;
  color: light-dark(rgba(15, 23, 42, 0.6), rgba(241, 245, 249, 0.6));
}
.inkwell-status-btn[data-tone="dirty"] {
  color: light-dark(#0f172a, #f1f5f9);
}
.inkwell-status-btn[data-tone="saving"] {
  color: light-dark(#0f172a, #f1f5f9);
}
.inkwell-status-btn[data-tone="saved"] {
  color: light-dark(#16a34a, #4ade80);
}
.inkwell-status-btn[data-tone="error"] {
  color: light-dark(#b62623, #ff8b8b);
}
.inkwell-status-btn[data-interactive="true"] {
  cursor: pointer;
}
.inkwell-status-btn[data-interactive="true"]:hover {
  background-color: light-dark(rgba(0, 0, 0, 0.06), rgba(255, 255, 255, 0.08));
}
.inkwell-status-btn:disabled {
  cursor: default;
}
.inkwell-status-btn[data-spinning="true"] svg {
  animation: inkwell-status-spin 1s linear infinite;
}
@keyframes inkwell-status-spin {
  to { transform: rotate(360deg); }
}
/* Touch users get a larger hit area (≈44px including focus ring). */
@media (pointer: coarse) {
  .inkwell-status-btn { width: 36px; height: 36px; }
}

/* Tier 2 sidebar toggles — column 3 of the grid, row 1. Empty
   (display:none) on desktop; visible only at narrow viewports
   where drawio's smallScreenWidth=1024 collapses both side panels.
   The buttons drive drawio's own toggle actions via the
   contentWindow.editorUi handles, with aria-pressed mirroring
   drawio's actual panel state via MutationObserver. */
.inkwell-trailing-container {
  position: relative;
  grid-column: 3;
  grid-row: 1;
  height: 28px;
  display: none;
  align-items: center;
  gap: 4px;
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

/* Sketch theme — scoped on body.geSketch which drawio sets when
   ui=sketch. The brand mark, filename, and save-status all live
   inside the floating top-left pill (sketchMainMenuElt) so the
   scene title is colocated with the hamburger menu. Drawio's own
   filename status in sketchMenubarElt (top-right) is suppressed
   below; with no other content there in embed mode the whole
   right-edge pill is hidden. */
body.geSketch .inkwell-app-icon {
  position: relative;
  margin: 0 4px 0 0;
  width: 36px;
  height: 36px;
  flex: 0 0 auto;
}
body.geSketch .inkwell-app-icon > button,
body.geSketch .inkwell-app-icon > div {
  width: 36px;
  height: 36px;
  border-radius: 4px;
}
/* Filename + save status sit inline inside the sketch main pill.
   flex: 0 1 auto lets the slot shrink past its content size on
   narrow viewports without pushing the trailing buttons off the
   pill. min-width: 0 is the canonical idiom for ellipsis-capable
   flex children. The pill's own padding (0 10px) supplies the gap
   to the brand, so this slot adds only inner gap. */
body.geSketch .inkwell-filename-container {
  position: relative;
  flex: 0 1 auto;
  min-width: 0;
  margin: 0;
  padding: 0 2px;
  height: auto;
  display: flex;
  align-items: center;
  gap: 4px;
}
/* Filename text inside the dark sketch pill. Hover lightens against
   the pill background to mirror drawio's own .geButton hover. */
body.geSketch .inkwell-drawio-title-text {
  font-size: 13px;
  font-weight: 600;
  padding: 4px 6px;
  /* Cap the text width so a long filename can't push the trailing
     buttons off the floating pill. The ellipsis kicks in past this. */
  max-width: 180px;
}
body.geSketch .inkwell-drawio-title-text[data-clickable="true"]:hover {
  background-color: light-dark(rgba(0, 0, 0, 0.06), rgba(255, 255, 255, 0.10));
}
/* Save-status icon next to the filename inside the sketch pill.
   Sized 28px to match drawio's own geButton footprint in this
   pill; touch users get the standard 36px from inkwell-status-btn
   pointer:coarse rule. */
body.geSketch .inkwell-status-btn {
  width: 28px;
  height: 28px;
}
@media (pointer: coarse) {
  body.geSketch .inkwell-status-btn { width: 36px; height: 36px; }
}
/* Suppress drawio's native filename + the now-empty right-edge
   pill. .geStatusDiv inside .geButtonContainer is where sketch
   renders the file name; with the filename moved to the main pill
   we hide it here. The whole sketchMenubarElt becomes empty in
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

// Style-aware slot resolver. Kennedy injects into
// `.geMenubarContainer`; sketch injects into `sketchMainMenuElt` (top-
// left, brand mark) and `sketchMenubarElt` (top-right, save status).
// In sketch the filename is already rendered by drawio's own
// `.geStatus` element, so the filename slot is null — the React side
// renders only the save-status portal then.
function ensureSlots(
  iframe: HTMLIFrameElement,
  style: "classic" | "sketch",
): DrawioMenubarSlots | null {
  return style === "sketch" ? ensureSketchSlots(iframe) : ensureKennedySlots(iframe);
}

function ensureKennedySlots(iframe: HTMLIFrameElement): DrawioMenubarSlots | null {
  const doc = iframe.contentDocument;
  if (!doc) return null;
  const menubar = doc.querySelector<HTMLDivElement>(".geMenubarContainer");
  if (!menubar) return null;
  ensureStylesheet(doc);

  // All slots are flex children, so insertion order matters —
  // appended in display order: brand, filename, trailing.
  const ensure = (cls: string): HTMLDivElement => {
    const existing = menubar.querySelector<HTMLDivElement>(`.${cls}`);
    if (existing) return existing;
    const el = doc.createElement("div");
    el.className = cls;
    menubar.appendChild(el);
    return el;
  };

  return {
    appIcon: ensure("inkwell-app-icon"),
    filename: ensure("inkwell-filename-container"),
    trailing: ensure("inkwell-trailing-container"),
  };
}

interface DrawioSketchUI {
  sketchMainMenuElt?: HTMLElement;
  sketchMenubarElt?: HTMLElement;
}

function ensureSketchSlots(iframe: HTMLIFrameElement): DrawioMenubarSlots | null {
  const doc = iframe.contentDocument;
  const w = iframe.contentWindow as (Window & { editorUi?: DrawioSketchUI }) | null;
  const ui = w?.editorUi;
  if (!doc || !ui?.sketchMainMenuElt) return null;
  ensureStylesheet(doc);

  const main = ui.sketchMainMenuElt;

  // Brand mark — prepend into the sketch main menu so it sits
  // before the hamburger. We re-insert if drawio re-rendered the
  // menu (idempotent: existing element matched by class).
  let appIcon = main.querySelector<HTMLDivElement>(".inkwell-app-icon");
  if (!appIcon) {
    appIcon = doc.createElement("div");
    appIcon.className = "inkwell-app-icon";
    main.insertBefore(appIcon, main.firstChild);
  }

  // Filename + save-status slot — sits between the brand and the
  // hamburger menu inside the sketch main pill. Drawio's own
  // `.geStatus` filename in `sketchMenubarElt` is hidden via the
  // injected stylesheet so the title is shown in only one place.
  let filename = main.querySelector<HTMLDivElement>(".inkwell-filename-container");
  if (!filename) {
    filename = doc.createElement("div");
    filename.className = "inkwell-filename-container";
    // appIcon.nextSibling lands the slot at index 1 (right after
    // the brand). If drawio re-rendered and only the brand exists,
    // nextSibling is null and insertBefore degrades to appendChild —
    // still correct (slot ends up after the brand).
    main.insertBefore(filename, appIcon.nextSibling);
  }

  // No trailing slot in sketch — the floating shape picker and
  // format-panel button drawio renders cover the role Kennedy's
  // sidebar toggles play, and the save status now lives next to
  // the filename inside the main pill.
  return {
    appIcon,
    filename,
    trailing: null,
  };
}

function ensureStylesheet(doc: Document) {
  if (doc.getElementById(MENUBAR_STYLE_ID)) return;
  const style = doc.createElement("style");
  style.id = MENUBAR_STYLE_ID;
  style.textContent = MENUBAR_CSS;
  doc.head.appendChild(style);
}

type StatusTone = "saved" | "dirty" | "saving" | "error" | "loading" | "readonly";

export default function DrawioEditor({
  loaded,
  save,
  saveThumb,
  onThumbSaved,
  onReload,
  reload,
  back = null,
  onRequestRename,
  fileMenuExtras,
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
          // File-menu extras (Tags / Share / Download) — wired into
          // drawio's native File menu via `addPluginMenuItems`. The
          // bootstrap script in `public/drawio-bootstrap.js` exposes
          // `editorUi` on the iframe's contentWindow before this
          // `init` postMessage fires, so the install runs cleanly
          // here without polling.
          if (fileMenuExtras) {
            installFileMenuExtras(iframeRef.current, fileMenuExtras);
          }
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
    fileMenuExtras,
    lifecycle,
    loaded.meta.hasThumb,
    loaded.meta.name,
    onThumbSaved,
    post,
    readOnly,
    saveThumb,
  ]);

  // Re-install File-menu extras when the handler refs change after
  // the initial `init`. The install is idempotent on the same
  // EditorUi instance — it just hot-swaps the handler refs without
  // re-registering actions or duplicating menu items.
  useEffect(() => {
    if (!ready || !fileMenuExtras || !iframeRef.current) return;
    installFileMenuExtras(iframeRef.current, fileMenuExtras);
  }, [ready, fileMenuExtras]);

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
  const requestBack = useCallback(() => {
    if (!back) return;
    leave.requestLeave(back.onClick);
  }, [back, leave]);

  // ─── Save-status control state ──────────────────────────────────
  const statusTone: StatusTone = readOnly
    ? "readonly"
    : !ready
      ? "loading"
      : lifecycle.status === "dirty"
        ? "dirty"
        : lifecycle.status === "saving"
          ? "saving"
          : lifecycle.status === "error"
            ? "error"
            : "saved";

  const renameInteractive = !readOnly && !!onRequestRename;
  const saveInteractive = !readOnly && (statusTone === "dirty" || statusTone === "error");
  const saveDisabled = !readOnly && statusTone === "saving";

  let statusTitle: string;
  let statusIcon: ReactNode;
  let statusToneAttr: string;
  let statusSpinning = false;
  switch (statusTone) {
    case "readonly":
      statusTitle = "Read-only";
      statusIcon = <HugeiconsIcon icon={EyeIcon} size={16} strokeWidth={2} />;
      statusToneAttr = "readonly";
      break;
    case "loading":
      statusTitle = "Loading…";
      statusIcon = <HugeiconsIcon icon={Loading03Icon} size={16} strokeWidth={2} />;
      statusToneAttr = "saving";
      statusSpinning = true;
      break;
    case "dirty":
      statusTitle = "Save now";
      statusIcon = <HugeiconsIcon icon={FloppyDiskIcon} size={16} strokeWidth={2} />;
      statusToneAttr = "dirty";
      break;
    case "saving":
      statusTitle = "Saving…";
      statusIcon = <HugeiconsIcon icon={Loading03Icon} size={16} strokeWidth={2} />;
      statusToneAttr = "saving";
      statusSpinning = true;
      break;
    case "error":
      statusTitle = lifecycle.errorMessage || "Save failed — click to retry";
      statusIcon = <HugeiconsIcon icon={Alert02Icon} size={16} strokeWidth={2} />;
      statusToneAttr = "error";
      break;
    default:
      statusTitle = "Saved";
      statusIcon = <HugeiconsIcon icon={CheckmarkCircle02Icon} size={16} strokeWidth={2} />;
      statusToneAttr = "saved";
  }

  const statusButton =
    saveInteractive || saveDisabled ? (
      <button
        type="button"
        className="inkwell-status-btn"
        data-tone={statusToneAttr}
        data-interactive={saveInteractive ? "true" : "false"}
        data-spinning={statusSpinning ? "true" : "false"}
        title={statusTitle}
        aria-label={statusTitle}
        disabled={saveDisabled}
        onClick={saveInteractive ? () => void lifecycle.saveNow() : undefined}
      >
        {statusIcon}
      </button>
    ) : (
      <div
        role="status"
        className="inkwell-status-btn"
        data-tone={statusToneAttr}
        data-interactive="false"
        data-spinning={statusSpinning ? "true" : "false"}
        title={statusTitle}
        aria-label={statusTitle}
      >
        {statusIcon}
      </div>
    );

  // Brand mark — clickable when `back` is provided. The InkwellMark
  // component sets `className="size-6"`, which is a Tailwind class
  // that doesn't resolve inside the iframe; `.inkwell-app-icon svg`
  // (in MENUBAR_CSS) sizes it explicitly instead.
  const brand = back ? (
    <button type="button" onClick={requestBack} aria-label={back.label} title={back.label}>
      <InkwellMark />
    </button>
  ) : (
    <div role="img" aria-label="Inkwell">
      <InkwellMark />
    </div>
  );

  return (
    <div className="relative h-full w-full overflow-hidden bg-background">
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

      {slots ? createPortal(brand, slots.appIcon) : null}

      {/* Filename + save status. Both Kennedy and sketch render this
          inline next to the brand mark — sketch slots it into the
          floating top-left pill, between the brand and the
          hamburger menu (drawio's native filename in the right-edge
          pill is hidden via injected CSS). */}
      {slots
        ? createPortal(
            <>
              <button
                type="button"
                className="inkwell-drawio-title-text"
                data-clickable={renameInteractive ? "true" : "false"}
                onDoubleClick={renameInteractive ? onRequestRename : undefined}
                disabled={!renameInteractive}
                title={
                  renameInteractive
                    ? `${loaded.meta.name} — double-click to rename`
                    : loaded.meta.name
                }
              >
                {loaded.meta.name}
              </button>
              {statusButton}
            </>,
            slots.filename,
          )
        : null}

      {/* Trailing slot — Kennedy only. Hosts the Tier 2 sidebar
          toggles (visible only below 1024px via CSS). Sketch has
          `trailing: null` since drawio's own floating shape picker
          and format-panel button cover the same role; the save
          status moved into the filename slot above. */}
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
