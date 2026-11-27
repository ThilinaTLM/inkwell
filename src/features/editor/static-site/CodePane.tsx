// CodePane — the right-hand side of the Files workspace for one file:
// a slim file bar (path, size, entry chip, actions) over a themed
// CodeMirror, an image viewer, or a "can't edit this" notice.

import { Delete02Icon, Home01Icon, RefreshIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@/components/ui/button";
import type { StaticSiteAsset } from "@/lib/api/client";
import { CodeMirrorEditor } from "../markdown/CodeMirrorEditor";
import { KindTile } from "./FileRow";
import { baseName, formatBytes, isHtmlPath, isImageAsset } from "./sitePaths";

export type BufferState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "unsupported"; reason: string }
  | { status: "ready"; text: string };

export interface CodePaneProps {
  asset: StaticSiteAsset;
  isEntry: boolean;
  writable: boolean;
  dark: boolean;
  buffer: BufferState;
  /** Editor mount key — changes when the file is reloaded externally. */
  editorKey: string;
  imageUrl: string | null;
  busy: boolean;
  onChange: (text: string) => void;
  onRefreshPreview: () => void;
  onSetEntry: () => void;
  onDelete: () => void;
}

const MONO = '"JetBrains Mono Variable", ui-monospace, SFMono-Regular, Menlo, monospace';

export function CodePane({
  asset,
  isEntry,
  writable,
  dark,
  buffer,
  editorKey,
  imageUrl,
  busy,
  onChange,
  onRefreshPreview,
  onSetEntry,
  onDelete,
}: CodePaneProps) {
  const dir = asset.path.includes("/") ? asset.path.slice(0, asset.path.lastIndexOf("/") + 1) : "";
  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="site-code-pane">
      <div className="flex h-11 shrink-0 items-center gap-2 border-b border-border/60 px-3">
        <KindTile path={asset.path} className="size-6 rounded-md text-[9px]" />
        <div className="flex min-w-0 items-baseline gap-2">
          <span className="truncate font-mono text-[13px]" title={asset.path}>
            <span className="text-muted-foreground">{dir}</span>
            {baseName(asset.path)}
          </span>
          <span className="hidden text-xs text-muted-foreground sm:inline">
            {formatBytes(asset.size)}
          </span>
          {isEntry ? (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-accent-soft px-1.5 py-px text-[10px] font-medium text-accent-text">
              <HugeiconsIcon icon={Home01Icon} strokeWidth={2} className="size-2.5" />
              Entry
            </span>
          ) : null}
        </div>
        <div className="flex-1" />
        {writable && !isEntry && isHtmlPath(asset.path) ? (
          <Button variant="ghost" size="sm" onClick={onSetEntry} disabled={busy}>
            <span className="hidden sm:inline">Set as entry</span>
            <HugeiconsIcon icon={Home01Icon} strokeWidth={1.8} className="sm:hidden" />
          </Button>
        ) : null}
        {writable && !isEntry ? (
          <Button
            variant="ghost"
            size="icon"
            onClick={onDelete}
            disabled={busy}
            aria-label="Delete file"
            title="Delete file"
            className="text-muted-foreground hover:text-destructive"
          >
            <HugeiconsIcon icon={Delete02Icon} strokeWidth={1.8} />
          </Button>
        ) : null}
        <Button
          variant="ghost"
          size="icon"
          onClick={onRefreshPreview}
          aria-label="Reload preview"
          title="Reload preview"
        >
          <HugeiconsIcon icon={RefreshIcon} strokeWidth={1.8} />
        </Button>
        {/* Save lives in the editor header (one Save button per editor). */}
      </div>

      <div className="min-h-0 flex-1">
        {buffer.status === "ready" ? (
          <CodeMirrorEditor
            key={editorKey}
            value={buffer.text}
            onChange={onChange}
            readOnly={!writable}
            dark={dark}
            fontFamily={MONO}
            language={isHtmlPath(asset.path) ? "html" : "text"}
            ariaLabel={`${asset.path} source`}
          />
        ) : buffer.status === "unsupported" && isImageAsset(asset) && imageUrl ? (
          <div className="flex h-full items-center justify-center overflow-auto bg-muted/30 p-6">
            <img
              src={imageUrl}
              alt={asset.path}
              className="max-h-full max-w-full rounded-lg border border-border bg-card object-contain shadow-card"
            />
          </div>
        ) : (
          <div className="flex h-full items-center justify-center p-8 text-center text-sm text-muted-foreground">
            {buffer.status === "loading"
              ? "Loading…"
              : buffer.status === "error"
                ? buffer.message
                : buffer.reason}
          </div>
        )}
      </div>
    </div>
  );
}
