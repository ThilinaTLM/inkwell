// PreviewFrame — the rendered site inside a quiet browser-style frame:
// address pill, reload, open-in-new-tab and device-width presets. The
// frame sits on the app background so the white page never reads as a
// raw slab.
//
// The iframe is sandboxed WITHOUT `allow-same-origin` (see
// StaticSiteEditor for the security note).

import {
  Alert02Icon,
  ComputerIcon,
  LinkSquare01Icon,
  RefreshIcon,
  SmartPhone01Icon,
  Tablet01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/segmented";
import { cn } from "@/lib/utils";

type Device = "desktop" | "tablet" | "mobile";
const DEVICE_WIDTH: Record<Device, string | undefined> = {
  desktop: undefined,
  tablet: "768px",
  mobile: "390px",
};

export interface PreviewFrameProps {
  url: string | null;
  entry: string;
  nonce: number;
  version: number;
  error: string | null;
  title: string;
  onRefresh: () => void;
  onOpen: () => void;
  openPending: boolean;
  /** Unsaved edits exist: the preview shows the last saved version. */
  unsaved?: boolean;
  onSave?: () => void;
}

export function PreviewFrame({
  url,
  entry,
  nonce,
  version,
  error,
  title,
  onRefresh,
  onOpen,
  openPending,
  unsaved,
  onSave,
}: PreviewFrameProps) {
  const [device, setDevice] = useState<Device>("desktop");
  const width = DEVICE_WIDTH[device];

  return (
    <div
      className="flex h-full min-h-0 flex-col bg-muted/30 p-2 sm:p-4"
      data-testid="site-preview-pane"
    >
      <div
        className="mx-auto flex min-h-0 w-full flex-1 flex-col overflow-hidden rounded-[14px] border border-border bg-card shadow-card transition-[max-width] duration-200"
        style={{ maxWidth: width ?? "100%" }}
      >
        <div className="flex h-10 shrink-0 items-center gap-2 border-b border-border/70 bg-card px-2.5">
          <div aria-hidden className="hidden items-center gap-1.5 pl-1 sm:flex">
            <span className="size-2.5 rounded-full bg-border" />
            <span className="size-2.5 rounded-full bg-border" />
            <span className="size-2.5 rounded-full bg-border" />
          </div>
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
          <div
            className="flex h-7 min-w-0 flex-1 items-center rounded-full bg-muted px-3 font-mono text-xs text-muted-foreground"
            title={entry}
          >
            <span className="truncate">
              <span className="opacity-60">/</span>
              {entry}
            </span>
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onOpen}
            disabled={openPending || !url}
            title="Open in a new tab"
            aria-label="Open in new tab"
          >
            <HugeiconsIcon icon={LinkSquare01Icon} strokeWidth={1.8} />
          </Button>
        </div>

        <div className="relative min-h-0 flex-1 bg-white">
          {error ? (
            <Notice icon>{error}</Notice>
          ) : !url ? (
            <Notice>Preparing preview…</Notice>
          ) : (
            <iframe
              // Remount on refresh / new bundle version so the page really reloads.
              key={`${version}:${nonce}`}
              title={`${title} preview`}
              src={`${url}?v=${version}-${nonce}`}
              sandbox="allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-modals allow-downloads"
              referrerPolicy="no-referrer"
              data-testid="site-preview"
              className="absolute inset-0 h-full w-full border-0 bg-white"
            />
          )}
        </div>
      </div>

      <div className="mt-2 flex min-h-7 items-center justify-center gap-3">
        {unsaved ? (
          <p className="flex items-center gap-2 text-xs text-muted-foreground" role="status">
            Showing the last saved version.
            <button
              type="button"
              onClick={onSave}
              className="font-medium text-accent-text underline underline-offset-4 hover:text-foreground"
            >
              Save to update
            </button>
          </p>
        ) : null}
        <Segmented<Device>
          ariaLabel="Preview width"
          value={device}
          onChange={setDevice}
          className="hidden h-7 sm:inline-flex"
          options={[
            {
              value: "desktop",
              title: "Desktop",
              label: <DeviceLabel icon={ComputerIcon} text="Desktop" />,
            },
            {
              value: "tablet",
              title: "Tablet · 768px",
              label: <DeviceLabel icon={Tablet01Icon} text="Tablet" />,
            },
            {
              value: "mobile",
              title: "Mobile · 390px",
              label: <DeviceLabel icon={SmartPhone01Icon} text="Mobile" />,
            },
          ]}
        />
      </div>
    </div>
  );
}

function DeviceLabel({ icon, text }: { icon: typeof ComputerIcon; text: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <HugeiconsIcon icon={icon} strokeWidth={1.8} className="size-3.5" />
      {text}
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
