import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
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
    if (sceneChanged) setReady(false);
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

  const statusLabel = readOnly
    ? "Read-only"
    : status === "dirty"
      ? "Unsaved"
      : status === "saving"
        ? "Saving…"
        : status === "error"
          ? errorMsg || "Save failed"
          : ready
            ? "Saved"
            : "Loading…";

  return (
    <div className="relative h-full w-full overflow-hidden bg-background">
      <div className="absolute left-3 right-3 top-3 z-10 flex items-center justify-between gap-3 rounded-xl border border-border/70 bg-background/90 px-3 py-2 shadow-sm backdrop-blur">
        <div className="flex min-w-0 items-center gap-2">
          {back ? (
            <Button type="button" variant="outline" size="sm" onClick={() => void handleBack()}>
              ← {back.label}
            </Button>
          ) : null}
          <button
            type="button"
            className="truncate rounded px-2 py-1 text-left font-heading text-lg hover:bg-accent"
            onDoubleClick={onRequestRename}
            disabled={readOnly || !onRequestRename}
            title={loaded.meta.name}
          >
            {loaded.meta.name}
          </button>
          <span className="shrink-0 rounded-full bg-muted px-2 py-1 text-xs text-muted-foreground">
            draw.io · {statusLabel}
          </span>
        </div>
        {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
      </div>

      <iframe
        ref={iframeRef}
        src={DRAWIO_SRC}
        title="draw.io editor"
        className="h-full w-full border-0"
        allow="clipboard-read; clipboard-write"
      />
    </div>
  );
}

function getDrawioXml(loaded: LoadedScene): string {
  const blob = loaded.blob as Partial<DrawioSceneBlob>;
  return typeof blob.xml === "string" ? blob.xml : "";
}
