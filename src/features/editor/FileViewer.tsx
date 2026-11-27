// FileViewer — read-only body for `kind === "file"` (uploaded files).
//
// Picks a renderer from the Content-Type (falling back to the file
// extension): image (fit, click to zoom, checkerboard), PDF (browser
// viewer), video / audio (native players), text / code / JSON / CSV
// (read-only CodeMirror, first ~2 MB), HTML / SVG (sandboxed iframe
// without `allow-same-origin`), anything else a typed card with a
// Download button. Used by the owner page and the share-token page; it
// only needs URLs, so it never touches owner-only APIs.

import { Download01Icon, FileAttachmentIcon, MusicNote01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { CodeMirrorEditor } from "./markdown/CodeMirrorEditor";

export interface FileViewerProps {
  name: string;
  mime: string | null;
  sizeBytes: number | null;
  /** Inline bytes (`files.rawUrl` / `shares.rawUrl` / `shares.folderFileRawUrl`). */
  rawUrl: string;
  /** Attachment URL; `null` hides the Download button. */
  downloadUrl: string | null;
}

type ViewKind = "image" | "pdf" | "video" | "audio" | "text" | "html" | "svg" | "other";

const TEXT_EXT =
  /\.(txt|log|md|markdown|json|jsonc|csv|tsv|xml|ya?ml|toml|ini|env|conf|js|mjs|cjs|jsx|ts|tsx|css|scss|py|rb|go|rs|java|c|h|cpp|hpp|sh|bash|zsh|sql|php|swift|kt|lua|diff|patch)$/i;
const TEXT_LIMIT = 2 * 1024 * 1024;

export function classifyFile(name: string, mime: string | null): ViewKind {
  const m = (mime ?? "").toLowerCase().split(";")[0].trim();
  if (m === "image/svg+xml" || /\.svg$/i.test(name)) return "svg";
  if (m.startsWith("image/")) return "image";
  if (m === "application/pdf" || /\.pdf$/i.test(name)) return "pdf";
  if (m.startsWith("video/")) return "video";
  if (m.startsWith("audio/")) return "audio";
  if (m === "text/html" || m === "application/xhtml+xml" || /\.html?$/i.test(name)) return "html";
  if (
    m.startsWith("text/") ||
    /^application\/(json|xml|javascript|x-yaml|yaml|toml|x-sh|sql)/.test(m) ||
    m.endsWith("+json") ||
    m.endsWith("+xml") ||
    TEXT_EXT.test(name)
  ) {
    return "text";
  }
  return "other";
}

export function formatBytes(n: number | null): string {
  if (n === null || Number.isNaN(n)) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

export function FileViewer(props: FileViewerProps) {
  const { name, mime, rawUrl } = props;
  const kind = classifyFile(name, mime);
  switch (kind) {
    case "image":
      return <ImageView name={name} src={rawUrl} />;
    case "pdf":
      return (
        <iframe
          title={name}
          src={rawUrl}
          data-testid="file-viewer-pdf"
          className="h-full w-full border-0 bg-muted"
        />
      );
    case "video":
      return (
        <div className="flex h-full items-center justify-center bg-black/90 p-4">
          {/* biome-ignore lint/a11y/useMediaCaption: user-uploaded media has no caption track */}
          <video
            src={rawUrl}
            controls
            preload="metadata"
            data-testid="file-viewer-video"
            className="max-h-full max-w-full rounded-lg"
          />
        </div>
      );
    case "audio":
      return (
        <div className="flex h-full flex-col items-center justify-center gap-5 p-8">
          <HugeiconsIcon
            icon={MusicNote01Icon}
            strokeWidth={1.2}
            className="size-16 text-muted-foreground"
          />
          <div className="font-display text-xl">{name}</div>
          {/* biome-ignore lint/a11y/useMediaCaption: user-uploaded media has no caption track */}
          <audio
            src={rawUrl}
            controls
            preload="metadata"
            data-testid="file-viewer-audio"
            className="w-full max-w-md"
          />
        </div>
      );
    case "html":
    case "svg":
      return (
        <iframe
          title={name}
          src={rawUrl}
          data-testid="file-viewer-html"
          // Opaque origin: scripts may run (HTML), but no access to Inkwell's cookies/DOM.
          sandbox={kind === "html" ? "allow-scripts allow-forms allow-popups" : ""}
          referrerPolicy="no-referrer"
          className="h-full w-full border-0 bg-white"
        />
      );
    case "text":
      return <TextView {...props} />;
    default:
      return <FileCard {...props} />;
  }
}

// ─── Image ───────────────────────────────────────────────────────────

const CHECKER =
  "bg-[length:20px_20px] bg-[position:0_0,0_10px,10px_-10px,-10px_0] " +
  "bg-[linear-gradient(45deg,var(--muted)_25%,transparent_25%),linear-gradient(-45deg,var(--muted)_25%,transparent_25%),linear-gradient(45deg,transparent_75%,var(--muted)_75%),linear-gradient(-45deg,transparent_75%,var(--muted)_75%)]";

function ImageView({ name, src }: { name: string; src: string }) {
  const [zoomed, setZoomed] = useState(false);
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        This image could not be displayed.
      </div>
    );
  }
  return (
    <div className={cn("h-full overflow-auto", CHECKER)} data-testid="file-viewer-image">
      <div
        className={cn(
          "flex min-h-full min-w-full items-center justify-center p-4",
          zoomed ? "w-max" : "h-full",
        )}
      >
        {/* biome-ignore lint/a11y/useKeyWithClickEvents: zoom is a pointer convenience; the image is also reachable via Download */}
        <img
          src={src}
          alt={name}
          draggable={false}
          onClick={() => setZoomed((z) => !z)}
          onError={() => setFailed(true)}
          className={cn(
            "rounded-sm shadow-sm",
            zoomed
              ? "max-w-none cursor-zoom-out"
              : "max-h-full max-w-full cursor-zoom-in object-contain",
          )}
        />
      </div>
    </div>
  );
}

// ─── Text / code ─────────────────────────────────────────────────────

function TextView({ name, rawUrl, sizeBytes }: FileViewerProps) {
  const { resolved } = useTheme();
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [truncated, setTruncated] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setText(null);
    setError(null);
    void fetch(rawUrl, {
      credentials: "include",
      headers: { Range: `bytes=0-${TEXT_LIMIT - 1}` },
    })
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const buf = await r.arrayBuffer();
        const cut = buf.byteLength > TEXT_LIMIT;
        return {
          text: new TextDecoder().decode(cut ? buf.slice(0, TEXT_LIMIT) : buf),
          cut: cut || r.status === 206 || (sizeBytes ?? 0) > TEXT_LIMIT,
        };
      })
      .then((res) => {
        if (cancelled) return;
        setText(res.text);
        setTruncated(res.cut && (sizeBytes ?? 0) > TEXT_LIMIT);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "could not load the file");
      });
    return () => {
      cancelled = true;
    };
  }, [rawUrl, sizeBytes]);

  if (error) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-sm text-muted-foreground">
        {error}
      </div>
    );
  }
  if (text === null) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }
  return (
    <div className="flex h-full flex-col" data-testid="file-viewer-text">
      {truncated ? (
        <div className="border-b border-border/50 bg-muted/50 px-4 py-1.5 text-xs text-muted-foreground">
          Showing the first 2 MB of {formatBytes(sizeBytes)}. Download the file for the rest.
        </div>
      ) : null}
      <div className="min-h-0 flex-1">
        <CodeMirrorEditor
          key={rawUrl}
          value={text}
          onChange={() => {}}
          readOnly
          dark={resolved === "dark"}
          fontFamily='ui-monospace, "JetBrains Mono Variable", SFMono-Regular, Menlo, monospace'
          language="text"
          ariaLabel={`Contents of ${name}`}
        />
      </div>
    </div>
  );
}

// ─── Fallback card ───────────────────────────────────────────────────

function FileCard({ name, mime, sizeBytes, downloadUrl }: FileViewerProps) {
  const ext = name.includes(".") ? (name.split(".").pop() ?? "").slice(0, 5).toUpperCase() : "";
  return (
    <div className="flex h-full items-center justify-center p-6" data-testid="file-viewer-card">
      <div className="flex w-full max-w-sm flex-col items-center gap-4 rounded-2xl border border-border bg-card p-8 text-center shadow-sm">
        <div className="relative grid size-24 place-items-center rounded-2xl bg-muted text-muted-foreground">
          <HugeiconsIcon icon={FileAttachmentIcon} strokeWidth={1.2} className="size-14" />
          {ext ? (
            <span className="absolute -bottom-2 rounded-md bg-primary px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-primary-foreground">
              {ext}
            </span>
          ) : null}
        </div>
        <div className="min-w-0 max-w-full">
          <div className="truncate font-display text-lg" title={name}>
            {name}
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            {[mime || "Unknown type", formatBytes(sizeBytes)].filter(Boolean).join(" · ")}
          </div>
        </div>
        <p className="text-sm text-muted-foreground">No preview is available for this file type.</p>
        {downloadUrl ? (
          <Button nativeButton={false} render={<a href={downloadUrl} download />}>
            <HugeiconsIcon icon={Download01Icon} strokeWidth={1.8} />
            Download
          </Button>
        ) : null}
      </div>
    </div>
  );
}
