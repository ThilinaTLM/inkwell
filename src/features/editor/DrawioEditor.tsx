// DrawioEditor — drawio scene host.
//
// Architecture mirrors Excalidraw's `SceneEditor`: an embedded
// drawio iframe (same-origin, served from `public/drawio`) we drive
// over the JSON postMessage protocol, with React portals injecting
// our chrome (logo, title, save-status control, host actions) into
// drawio's native menubar so it lives inside the iframe DOM and
// inherits drawio's typography/spacing.
//
// Header layout follows diagrams.net's natural Kennedy-theme chrome:
// a 60px two-row container with the brand mark absolute-top-left, the
// scene title + status absolute-top-mid, host actions absolute-top-
// right, and drawio's own File/Edit/View menubar at top:28 underneath.
// In embed mode drawio skips creating its own `geAppIcon` and
// `geFilenameContainer`, so we inject equivalents with the same
// rectangles and let `.geMenubar` fall back to its absolute position.
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
import { InkwellMark } from "@/components/InkwellMark";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { useDebounced } from "@/hooks/useDebounced";
import { ApiError, type DrawioSceneBlob, type LoadedScene } from "@/lib/api/client";
import { errorMessage } from "@/lib/errors";
import { type ResolvedTheme, useTheme } from "@/lib/theme";

export type DrawioSaveStatus = "dirty" | "saving" | "saved" | "error";

type SaveFn = (version: number, blob: DrawioSceneBlob) => Promise<{ version: number }>;

interface DrawioEditorProps {
  loaded: LoadedScene;
  save: SaveFn;
  onReload?: (loaded: LoadedScene) => void;
  reload?: () => Promise<LoadedScene>;
  back?: { onClick: () => void; label: string } | null;
  onRequestRename?: () => void;
  actions?: ReactNode;
}

interface DrawioMessage {
  event?: string;
  xml?: string;
  data?: string;
  error?: string;
}

// 30s autosave debounce, matching Excalidraw's `SceneEditor`. Manual
// save (the floppy-disk icon in the title slot) bypasses this.
const SAVE_DEBOUNCE_MS = 30_000;

// `noSaveBtn=1&saveAndExit=0` suppresses drawio's own embed Save
// button — we render the only Save surface via the combined status
// control. `dark` is appended at runtime so the iframe boots into the
// right theme; flips are handled by remounting the iframe (see the
// `iframeKey`-bumping effect below) since the embed protocol has no
// runtime dark-mode toggle.
function buildDrawioSrc(dark: boolean): string {
  return `/drawio/index.html?embed=1&proto=json&spin=1&libraries=1&noExitBtn=1&noSaveBtn=1&saveAndExit=0&dark=${dark ? 1 : 0}`;
}

// Slots we inject into drawio's `.geMenubarContainer`. Rendered into via
// React portals so the chrome lives natively inside the iframe DOM and
// inherits drawio's menubar typography/colors. Same-origin iframe (we
// serve `public/drawio` ourselves) is what makes this safe.
interface DrawioMenubarSlots {
  appIcon: HTMLDivElement;
  filename: HTMLDivElement;
  actions: HTMLDivElement;
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
const MENUBAR_STYLE_ID = "inkwell-drawio-menubar-style";
const MENUBAR_CSS = `
/* Undo compact-mode collapse — restore the natural Kennedy 2-row
   chrome that diagrams.net renders. */
.geEditor.geCompactMode > .geMenubarContainer {
  height: 60px !important;
  margin-top: 4px !important;
}
.geEditor.geCompactMode > .geMenubarContainer > .geMenubar {
  top: 28px !important;
  padding-left: 58px !important;
}
/* Embed mode adds horizontal padding on the menubar container that
   would push native menus out from under our injected logo. The
   logo and actions slots are absolute-positioned and own their own
   gutters, so neutralise the padding. */
.geEmbed .geMenubarContainer:not(.geMinimal *) {
  padding: 0 !important;
}
.geMenubarContainer > .geStatusDiv {
  display: none !important;
}

/* Brand mark — mirrors drawio's own .geAppIcon rectangle. The slot
   itself only handles positioning; cursor/hover live on the inner
   button so the static-brand variant (no back prop) does not pick
   them up. */
.inkwell-app-icon {
  position: absolute;
  top: 10px;
  left: 16px;
  width: 32px;
  height: 36px;
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

/* Filename + save-status row — mirrors drawio's own
   .geFilenameContainer rectangle. The 260px right reservation keeps
   the title clear of the absolute-positioned actions slot. */
.inkwell-filename-container {
  position: absolute;
  top: 4px;
  left: 60px;
  right: 260px;
  height: 26px;
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.inkwell-drawio-title-text {
  all: unset;
  font-size: 18px;
  font-weight: 600;
  font-family: inherit;
  line-height: 1.2;
  color: light-dark(#0f172a, #f1f5f9);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  padding: 2px 6px;
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

/* Combined save-status icon button. Tone is driven by data-tone;
   spinning state by data-spinning. Tailwind classes from the parent
   document don't apply inside the iframe — colours/animation are
   declared here. */
.inkwell-status-btn {
  all: unset;
  width: 24px;
  height: 24px;
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

/* Host actions slot — top-right, matching diagrams.net's Share
   button placement. */
.inkwell-actions-container {
  position: absolute;
  top: 8px;
  right: 12px;
  height: 30px;
  display: flex;
  align-items: center;
  gap: 6px;
}
.inkwell-native-btn {
  all: unset;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 26px;
  padding: 0 12px;
  font-size: 12px;
  font-family: inherit;
  color: inherit;
  cursor: pointer;
  border-radius: 4px;
  white-space: nowrap;
  user-select: none;
}
.inkwell-native-btn:hover {
  background-color: light-dark(rgba(0, 0, 0, 0.06), rgba(255, 255, 255, 0.08));
}
.inkwell-native-btn:disabled {
  opacity: 0.5;
  cursor: default;
}
.inkwell-native-btn--primary {
  border: 1px solid light-dark(var(--border-color, #d0d0d0), var(--dark-border-color, #424242));
}
`;

function ensureSlots(iframe: HTMLIFrameElement): DrawioMenubarSlots | null {
  const doc = iframe.contentDocument;
  if (!doc) return null;
  const menubar = doc.querySelector<HTMLDivElement>(".geMenubarContainer");
  if (!menubar) return null;

  if (!doc.getElementById(MENUBAR_STYLE_ID)) {
    const style = doc.createElement("style");
    style.id = MENUBAR_STYLE_ID;
    style.textContent = MENUBAR_CSS;
    doc.head.appendChild(style);
  }

  // All three slots are absolutely positioned, so insertion order
  // doesn't matter — append idempotently.
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
    actions: ensure("inkwell-actions-container"),
  };
}

type StatusTone = "saved" | "dirty" | "saving" | "error" | "loading" | "readonly";

export default function DrawioEditor({
  loaded,
  save,
  onReload,
  reload,
  back = null,
  onRequestRename,
  actions,
}: DrawioEditorProps) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const readOnly = loaded.permission !== "write";
  const initialXml = getDrawioXml(loaded);
  const versionRef = useRef(loaded.meta.version);
  const savedXmlRef = useRef(initialXml);
  const latestXmlRef = useRef(initialXml);
  const inflightRef = useRef(false);
  const previousSceneIdRef = useRef(loaded.meta.id);
  const [status, setStatus] = useState<DrawioSaveStatus>("saved");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [slots, setSlots] = useState<DrawioMenubarSlots | null>(null);
  const { resolved } = useTheme();
  const lastResolvedRef = useRef<ResolvedTheme>(resolved);

  const targetOrigin = useMemo(() => window.location.origin, []);
  const drawioSrc = useMemo(() => buildDrawioSrc(resolved === "dark"), [resolved]);

  useEffect(() => {
    versionRef.current = loaded.meta.version;
  }, [loaded.meta.version]);

  useEffect(() => {
    const sceneChanged = previousSceneIdRef.current !== loaded.meta.id;
    previousSceneIdRef.current = loaded.meta.id;
    savedXmlRef.current = initialXml;
    latestXmlRef.current = initialXml;
    versionRef.current = loaded.meta.version;
    setStatus("saved");
    setErrorMsg(null);
    // Reset readiness only for a different scene. Parent save callbacks
    // update `loaded.meta.version` after every successful PUT; resetting
    // readiness on those version bumps would leave the iframe loaded while
    // our status falls back to "Loading…".
    if (sceneChanged) {
      setReady(false);
      setSlots(null);
    }
  }, [initialXml, loaded.meta.id, loaded.meta.version]);

  const post = useCallback(
    (message: Record<string, unknown>) => {
      iframeRef.current?.contentWindow?.postMessage(JSON.stringify(message), targetOrigin);
    },
    [targetOrigin],
  );

  const saveLatest = useCallback(async (): Promise<boolean> => {
    if (readOnly) return true;
    if (inflightRef.current) return false;
    const xml = latestXmlRef.current;
    if (xml === savedXmlRef.current) {
      setStatus("saved");
      setErrorMsg(null);
      return true;
    }

    inflightRef.current = true;
    setStatus("saving");
    setErrorMsg(null);
    try {
      const res = await save(versionRef.current, { kind: "drawio", xml });
      versionRef.current = res.version;
      savedXmlRef.current = xml;
      setStatus("saved");
      return true;
    } catch (e) {
      if (e instanceof ApiError && e.status === 409 && reload) {
        try {
          const fresh = await reload();
          onReload?.(fresh);
          versionRef.current = fresh.meta.version;
          const freshXml = getDrawioXml(fresh);
          savedXmlRef.current = freshXml;
          latestXmlRef.current = freshXml;
          post({
            action: "load",
            xml: freshXml,
            autosave: readOnly ? 0 : 1,
            title: fresh.meta.name,
            noSaveBtn: 1,
            noExitBtn: 1,
          });
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
      return false;
    } finally {
      inflightRef.current = false;
    }
  }, [readOnly, reload, onReload, post, save]);

  const debouncedSave = useDebounced(() => {
    void saveLatest();
  }, SAVE_DEBOUNCE_MS);

  const acceptXmlChange = useCallback(
    (xml: string, immediate: boolean) => {
      if (readOnly) return;
      latestXmlRef.current = xml;
      if (xml === savedXmlRef.current) {
        debouncedSave.cancel();
        setStatus("saved");
        setErrorMsg(null);
        return;
      }
      setStatus("dirty");
      setErrorMsg(null);
      if (immediate) void saveLatest();
      else debouncedSave();
    },
    [debouncedSave, readOnly, saveLatest],
  );

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
          const next = ensureSlots(iframeRef.current);
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
        return;
      }

      if ((msg.event === "autosave" || msg.event === "save") && typeof msg.xml === "string") {
        acceptXmlChange(msg.xml, msg.event === "save");
      }
    }

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [acceptXmlChange, loaded.meta.name, post, readOnly]);

  // Theme flip — drawio's embed protocol has no runtime dark-mode
  // toggle, so we force-save the current XML, drop our slot refs, and
  // let the keyed iframe (below) remount with the new `dark=` URL
  // param. The save is fire-and-forget — by the time the new iframe
  // boots, the PUT has either landed (canonical XML) or surfaced an
  // error via the existing status path.
  useEffect(() => {
    if (lastResolvedRef.current === resolved) return;
    lastResolvedRef.current = resolved;
    debouncedSave.flush();
    void saveLatest();
    setReady(false);
    setSlots(null);
  }, [resolved, debouncedSave, saveLatest]);

  // Unsaved-changes guard for in-app back navigation. `beforeunload`
  // (below) covers tab close / hard reload; this dialog covers the
  // logo's back-click. Mirrors `SceneEditor.tsx`.
  const isDirty = !readOnly && (status === "dirty" || status === "saving" || status === "error");
  const [confirmLeaveOpen, setConfirmLeaveOpen] = useState(false);
  const [leaveBusy, setLeaveBusy] = useState<false | "save">(false);
  const pendingBackRef = useRef<(() => void) | null>(null);

  // Live-ref the dirty flag so `beforeunload` doesn't have to re-bind
  // on every status tick.
  const isDirtyRef = useRef(isDirty);
  useEffect(() => {
    isDirtyRef.current = isDirty;
  }, [isDirty]);

  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      debouncedSave.flush();
      if (isDirtyRef.current) {
        e.preventDefault();
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

  const requestBack = useCallback(() => {
    if (!back) return;
    if (!isDirty) {
      back.onClick();
      return;
    }
    pendingBackRef.current = back.onClick;
    setConfirmLeaveOpen(true);
  }, [back, isDirty]);

  const cancelLeave = useCallback(() => {
    if (leaveBusy) return;
    pendingBackRef.current = null;
    setConfirmLeaveOpen(false);
  }, [leaveBusy]);

  const discardAndLeave = useCallback(() => {
    debouncedSave.cancel();
    // Drop pending edits — the parent will unmount this component on
    // navigation, releasing latestXmlRef along with everything else.
    latestXmlRef.current = savedXmlRef.current;
    setStatus("saved");
    setErrorMsg(null);
    setLeaveBusy(false);
    setConfirmLeaveOpen(false);
    const cont = pendingBackRef.current;
    pendingBackRef.current = null;
    cont?.();
  }, [debouncedSave]);

  const saveAndLeave = useCallback(async () => {
    setLeaveBusy("save");
    const ok = await saveLatest();
    if (!ok) {
      setLeaveBusy(false);
      return;
    }
    setLeaveBusy(false);
    setConfirmLeaveOpen(false);
    const cont = pendingBackRef.current;
    pendingBackRef.current = null;
    cont?.();
  }, [saveLatest]);

  // ─── Save-status control state ──────────────────────────────────
  const statusTone: StatusTone = readOnly
    ? "readonly"
    : !ready
      ? "loading"
      : status === "dirty"
        ? "dirty"
        : status === "saving"
          ? "saving"
          : status === "error"
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
      statusTitle = errorMsg || "Save failed — click to retry";
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
        onClick={saveInteractive ? () => void saveLatest() : undefined}
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
        // Remount when the resolved theme changes so drawio re-reads
        // `?dark=`. Cheap because it's only on explicit theme toggles.
        key={resolved}
        ref={iframeRef}
        src={drawioSrc}
        title="draw.io editor"
        className="h-full w-full border-0"
        allow="clipboard-read; clipboard-write"
      />

      {slots ? createPortal(brand, slots.appIcon) : null}

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

      {slots && actions ? createPortal(actions, slots.actions) : null}

      <AlertDialog
        open={confirmLeaveOpen}
        onOpenChange={(open) => {
          if (!open && !leaveBusy) cancelLeave();
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Leave with unsaved changes?</AlertDialogTitle>
            <AlertDialogDescription>
              Your latest edits haven't been saved yet. If you leave now they may be lost.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={!!leaveBusy}>Stay</AlertDialogCancel>
            <Button variant="destructive" onClick={discardAndLeave} disabled={!!leaveBusy}>
              Discard
            </Button>
            <Button onClick={() => void saveAndLeave()} disabled={!!leaveBusy}>
              {leaveBusy ? "Saving…" : "Save & Leave"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function getDrawioXml(loaded: LoadedScene): string {
  const blob = loaded.blob as Partial<DrawioSceneBlob>;
  return typeof blob.xml === "string" ? blob.xml : "";
}
