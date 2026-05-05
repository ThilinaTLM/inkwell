import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useDebounced } from "@/hooks/useDebounced";
import { ApiError, type DrawioSceneBlob, type LoadedScene } from "@/lib/api/client";
import { errorMessage } from "@/lib/errors";

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

const DRAWIO_SRC = "/drawio/index.html?embed=1&proto=json&spin=1&libraries=1&noExitBtn=1";

// Slots we inject into draw.io's `.geMenubarContainer`. Rendered into via
// React portals so the chrome lives natively inside the iframe DOM and
// inherits draw.io's menubar typography/colors. Same-origin iframe (we
// serve `public/drawio` ourselves) is what makes this safe.
interface DrawioMenubarSlots {
  back: HTMLDivElement;
  title: HTMLDivElement;
  actions: HTMLDivElement;
}

// Stylesheet injected into the iframe document to:
//   1. Convert `.geMenubarContainer` to a flex row so injected slots flow
//      next to native menus.
//   2. Demote `.geMenubar` (File/Edit/View/...) from absolute positioning
//      to a static flex item.
//   3. Hide draw.io's native `.geStatusDiv` (the file name in the top-
//      right) — we replace it with our own title + save-status capsule.
//   4. Provide native-feeling button styles for our injected controls,
//      using draw.io's own CSS variables so they adapt to its themes.
const MENUBAR_STYLE_ID = "inkwell-drawio-menubar-style";
const MENUBAR_CSS = `
.geMenubarContainer {
  display: flex !important;
  align-items: center;
  gap: 8px;
  padding: 0 8px !important;
  height: 36px !important;
}
.geMenubarContainer > .geMenubar {
  position: static !important;
  flex: 0 0 auto;
  width: auto !important;
  padding: 0 !important;
  height: 30px;
}
.geMenubarContainer > .geStatusDiv {
  display: none !important;
}
.inkwell-drawio-slot {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 30px;
  min-width: 0;
}
.inkwell-drawio-slot--title {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
}
.inkwell-drawio-slot--actions {
  margin-left: auto;
  flex: 0 0 auto;
}
.inkwell-native-btn {
  all: unset;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 24px;
  padding: 0 10px;
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
.inkwell-drawio-title-text {
  font-size: 13px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  padding: 2px 6px;
  border-radius: 4px;
  cursor: text;
  min-width: 0;
}
.inkwell-drawio-title-text[data-clickable="true"]:hover {
  background-color: light-dark(rgba(0, 0, 0, 0.06), rgba(255, 255, 255, 0.08));
}
.inkwell-drawio-status {
  font-size: 11px;
  opacity: 0.7;
  white-space: nowrap;
  flex-shrink: 0;
}
.inkwell-drawio-status[data-tone="error"] {
  color: light-dark(#b62623, #ff8b8b);
  opacity: 1;
}
.inkwell-drawio-status[data-tone="dirty"],
.inkwell-drawio-status[data-tone="saving"] {
  opacity: 0.85;
}
`;

function ensureSlots(iframe: HTMLIFrameElement): DrawioMenubarSlots | null {
  const doc = iframe.contentDocument;
  if (!doc) return null;
  const menubar = doc.querySelector(".geMenubarContainer");
  if (!menubar) return null;

  if (!doc.getElementById(MENUBAR_STYLE_ID)) {
    const style = doc.createElement("style");
    style.id = MENUBAR_STYLE_ID;
    style.textContent = MENUBAR_CSS;
    doc.head.appendChild(style);
  }

  const find = (cls: string) =>
    menubar.querySelector<HTMLDivElement>(`.inkwell-drawio-slot--${cls}`);
  let back = find("back");
  let title = find("title");
  let actions = find("actions");

  if (!back) {
    back = doc.createElement("div");
    back.className = "inkwell-drawio-slot inkwell-drawio-slot--back";
    menubar.insertBefore(back, menubar.firstChild);
  }
  const geMenubar = menubar.querySelector(".geMenubar");
  if (!title) {
    title = doc.createElement("div");
    title.className = "inkwell-drawio-slot inkwell-drawio-slot--title";
    if (geMenubar?.nextSibling) {
      menubar.insertBefore(title, geMenubar.nextSibling);
    } else {
      menubar.appendChild(title);
    }
  }
  if (!actions) {
    actions = doc.createElement("div");
    actions.className = "inkwell-drawio-slot inkwell-drawio-slot--actions";
    menubar.appendChild(actions);
  }

  return { back, title, actions };
}

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

  const targetOrigin = useMemo(() => window.location.origin, []);

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
            noSaveBtn: readOnly ? 1 : 0,
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
  }, 5_000);

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
        // Set up native menubar slots once draw.io has rendered its UI.
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
          noSaveBtn: readOnly ? 1 : 0,
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

  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      debouncedSave.flush();
      if (!readOnly && latestXmlRef.current !== savedXmlRef.current) {
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
  }, [debouncedSave, readOnly]);

  const handleBack = useCallback(async () => {
    debouncedSave.cancel();
    await saveLatest();
    back?.onClick();
  }, [back, debouncedSave, saveLatest]);

  const statusTone: "saved" | "dirty" | "saving" | "error" | "loading" | "readonly" = readOnly
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

  const statusLabel =
    statusTone === "readonly"
      ? "Read-only"
      : statusTone === "loading"
        ? "Loading…"
        : statusTone === "dirty"
          ? "Unsaved"
          : statusTone === "saving"
            ? "Saving…"
            : statusTone === "error"
              ? errorMsg || "Save failed"
              : "Saved";

  return (
    <div className="relative h-full w-full overflow-hidden bg-background">
      <iframe
        ref={iframeRef}
        src={DRAWIO_SRC}
        title="draw.io editor"
        className="h-full w-full border-0"
        allow="clipboard-read; clipboard-write"
      />

      {slots
        ? createPortal(
            back ? (
              <button
                type="button"
                className="inkwell-native-btn"
                onClick={() => void handleBack()}
                title={back.label}
              >
                <span aria-hidden>←</span>
                <span>{back.label}</span>
              </button>
            ) : null,
            slots.back,
          )
        : null}

      {slots
        ? createPortal(
            <>
              <button
                type="button"
                className="inkwell-drawio-title-text"
                data-clickable={!readOnly && onRequestRename ? "true" : "false"}
                onDoubleClick={onRequestRename}
                disabled={readOnly || !onRequestRename}
                title={loaded.meta.name}
              >
                {loaded.meta.name}
              </button>
              <span className="inkwell-drawio-status" data-tone={statusTone}>
                draw.io · {statusLabel}
              </span>
            </>,
            slots.title,
          )
        : null}

      {slots && actions ? createPortal(actions, slots.actions) : null}
    </div>
  );
}

function getDrawioXml(loaded: LoadedScene): string {
  const blob = loaded.blob as Partial<DrawioSceneBlob>;
  return typeof blob.xml === "string" ? blob.xml : "";
}
