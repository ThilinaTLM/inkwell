// PreviewFrame — the rendered site inside a quiet frame. One bar holds
// reload, a page picker (which HTML page to show), the live-draft / saved
// indicator, device-width presets and open-in-new-tab. The frame sits on
// the app background so the white page never reads as a raw slab.
//
// Saved state renders the signed URL; with unsaved edits it renders a
// `srcdoc` draft built from the buffer (see draftPreview.ts).
//
// The iframe is sandboxed WITHOUT `allow-same-origin` (see
// StaticSiteEditor for the security note).

import {
  Alert02Icon,
  ArrowDown01Icon,
  ComputerIcon,
  LinkSquare01Icon,
  RefreshIcon,
  SmartPhone01Icon,
  Tablet01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Segmented } from "@/components/ui/segmented";
import { cn } from "@/lib/utils";

type Device = "desktop" | "tablet" | "mobile";
const DEVICE_WIDTH: Record<Device, string | undefined> = {
  desktop: undefined,
  tablet: "768px",
  mobile: "390px",
};

export interface PreviewFrameProps {
  /** Saved URL of the page being previewed. */
  url: string | null;
  /** Bundle path of the page being previewed. */
  pagePath: string;
  /** HTML pages the preview can show. */
  pages: string[];
  onPageChange: (path: string) => void;
  nonce: number;
  version: number;
  error: string | null;
  title: string;
  onRefresh: () => void;
  onOpen: () => void;
  openPending: boolean;
  /** Unsaved edits exist: show the live draft instead of the saved page. */
  draft?: boolean;
  /** Draft document; null while it is (re)building. */
  srcDoc?: string | null;
  writable?: boolean;
  onSave?: () => void;
  /** Narrow pane (split view): drop the device presets. */
  compact?: boolean;
  /** Placeholder-site call to action. */
  hint?: { onEdit: () => void; onUpload: () => void } | null;
}

export function PreviewFrame({
  url,
  pagePath,
  pages,
  onPageChange,
  nonce,
  version,
  error,
  title,
  onRefresh,
  onOpen,
  openPending,
  draft,
  srcDoc,
  writable,
  onSave,
  compact,
  hint,
}: PreviewFrameProps) {
  const [device, setDevice] = useState<Device>("desktop");
  const width = compact ? undefined : DEVICE_WIDTH[device];
  const tight = compact || device !== "desktop";
  const showDraft = Boolean(draft && srcDoc);

  return (
    <div
      className={cn("flex h-full min-h-0 flex-col bg-muted/30", compact ? "p-2" : "p-2 sm:p-4")}
      data-testid="site-preview-pane"
    >
      <div
        className="mx-auto flex min-h-0 w-full flex-1 flex-col overflow-hidden rounded-[14px] border border-border bg-card shadow-card transition-[max-width] duration-200"
        style={{ maxWidth: width ?? "100%" }}
      >
        <div className="flex h-10 shrink-0 items-center gap-1.5 border-b border-border/70 bg-card px-2">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onRefresh}
            title="Reload preview"
            aria-label="Reload preview"
            disabled={!url}
          >
            <HugeiconsIcon icon={RefreshIcon} strokeWidth={1.8} />
          </Button>
          <PagePicker pagePath={pagePath} pages={pages} onChange={onPageChange} />
          {draft ? (
            <span
              data-testid="site-preview-state"
              data-state="draft"
              title="The preview shows your unsaved edits. Save to publish a new version."
              className="inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full bg-accent-soft px-2 text-[11px] font-medium text-accent-text"
            >
              <span aria-hidden className="size-1.5 rounded-full bg-primary" />
              {tight ? (
                <span className={compact ? undefined : "sr-only"}>Draft</span>
              ) : (
                <span className="sr-only sm:not-sr-only">Live draft — unsaved</span>
              )}
            </span>
          ) : (
            <span
              data-testid="site-preview-state"
              data-state="saved"
              title="The preview shows the saved version."
              className="inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full px-2 text-[11px] text-muted-foreground"
            >
              <span aria-hidden className="size-1.5 rounded-full bg-muted-foreground/50" />
              <span className={tight ? "sr-only" : "sr-only sm:not-sr-only"}>Saved</span>
            </span>
          )}
          {draft && writable && onSave ? (
            <Button size="sm" onClick={onSave} className="shrink-0">
              Save
            </Button>
          ) : null}
          {compact ? null : (
            <Segmented<Device>
              ariaLabel="Preview width"
              value={device}
              onChange={setDevice}
              className="hidden h-7 sm:inline-flex"
              options={[
                {
                  value: "desktop",
                  title: "Desktop",
                  label: <DeviceIcon icon={ComputerIcon} text="Desktop" />,
                },
                {
                  value: "tablet",
                  title: "Tablet · 768px",
                  label: <DeviceIcon icon={Tablet01Icon} text="Tablet · 768px" />,
                },
                {
                  value: "mobile",
                  title: "Mobile · 390px",
                  label: <DeviceIcon icon={SmartPhone01Icon} text="Mobile · 390px" />,
                },
              ]}
            />
          )}
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onOpen}
            disabled={openPending || !url}
            title="Open the saved site in a new tab"
            aria-label="Open in new tab"
          >
            <HugeiconsIcon icon={LinkSquare01Icon} strokeWidth={1.8} />
          </Button>
        </div>

        {hint ? (
          <div
            data-testid="site-placeholder-hint"
            className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-border/70 bg-accent-soft/50 px-3 py-2 text-xs text-muted-foreground"
          >
            <span className="min-w-0 flex-1">This is a placeholder page. Make it yours:</span>
            <Button size="sm" onClick={hint.onEdit}>
              Edit code
            </Button>
            <Button size="sm" variant="outline" onClick={hint.onUpload}>
              Upload files
            </Button>
          </div>
        ) : null}

        <div className="relative min-h-0 flex-1 bg-white">
          {error ? (
            <Notice icon>{error}</Notice>
          ) : !url ? (
            <Notice>Preparing preview…</Notice>
          ) : showDraft ? (
            <iframe
              key={`draft:${pagePath}:${nonce}`}
              title={`${title} preview (draft)`}
              srcDoc={srcDoc ?? undefined}
              sandbox={SANDBOX}
              referrerPolicy="no-referrer"
              data-testid="site-preview"
              data-draft="true"
              className="absolute inset-0 h-full w-full border-0 bg-white"
            />
          ) : (
            <iframe
              // Remount on refresh / new bundle version so the page really reloads.
              key={`saved:${pagePath}:${version}:${nonce}`}
              title={`${title} preview`}
              src={`${url}?v=${version}-${nonce}`}
              sandbox={SANDBOX}
              referrerPolicy="no-referrer"
              data-testid="site-preview"
              className="absolute inset-0 h-full w-full border-0 bg-white"
            />
          )}
        </div>
      </div>
    </div>
  );
}

const SANDBOX =
  "allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-modals allow-downloads";

/** Read-only path pill; a dropdown when the bundle has several pages. */
function PagePicker({
  pagePath,
  pages,
  onChange,
}: {
  pagePath: string;
  pages: string[];
  onChange: (p: string) => void;
}) {
  const label = (
    <>
      <span className="truncate">
        <span className="opacity-60">/</span>
        {pagePath}
      </span>
    </>
  );
  const base =
    "flex h-7 min-w-0 flex-1 items-center rounded-full bg-muted px-3 font-mono text-xs text-muted-foreground";
  if (pages.length < 2) {
    return (
      <div className={base} title={pagePath}>
        {label}
      </div>
    );
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            aria-label={`Preview page: ${pagePath}`}
            title="Choose the page to preview"
            data-testid="site-preview-page"
            className={cn(
              base,
              "justify-between gap-2 text-left outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50",
            )}
          >
            {label}
            <HugeiconsIcon icon={ArrowDown01Icon} strokeWidth={2} className="size-3 shrink-0" />
          </button>
        }
      />
      <DropdownMenuContent align="start" className="w-auto min-w-52">
        <DropdownMenuRadioGroup value={pagePath} onValueChange={onChange}>
          {pages.map((p) => (
            <DropdownMenuRadioItem key={p} value={p}>
              <span className="font-mono text-xs">{p}</span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function DeviceIcon({ icon, text }: { icon: typeof ComputerIcon; text: string }) {
  return (
    <span className="flex h-full items-center">
      <HugeiconsIcon icon={icon} strokeWidth={1.8} className="size-3.5" />
      <span className="sr-only">{text}</span>
    </span>
  );
}

function Notice({ children, icon }: { children: React.ReactNode; icon?: boolean }) {
  return (
    <div
      className={cn(
        "flex h-full flex-col items-center justify-center gap-2 bg-card p-8 text-center text-sm text-muted-foreground",
      )}
    >
      {icon ? (
        <HugeiconsIcon icon={Alert02Icon} strokeWidth={1.8} className="size-5 text-destructive" />
      ) : null}
      {children}
    </div>
  );
}
