// FolderTab — manila-folder card. The tab notch sits at the top-left and
// carries the accent color (so the Inbox can look "graphite-blue" while
// the body stays cream); the body is a separate RoughBox so each part can
// have its own fill.
//
// Two layout modes:
//   variant="strip"   — small horizontal tab used in the root-folder strip
//                       at the top of the dashboard. Compact, one line.
//   variant="grid"    — full folder card used in the in-folder grid for
//                       subfolders. Larger, with scene count + actions.

import * as React from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Folder01Icon, InboxIcon } from "@hugeicons/core-free-icons";
import { cn } from "@/lib/utils";
import { RoughBox } from "@/components/rough";
import { tiltFromId } from "./tilt";

export type FolderAccent = "manila" | "graphite" | "vermillion";

const ACCENT_FILL: Record<FolderAccent, string> = {
  manila: "var(--color-manila)",
  graphite: "var(--color-graphite)",
  vermillion: "var(--color-vermillion)",
};

const ACCENT_TEXT: Record<FolderAccent, string> = {
  manila: "var(--color-ink)",
  graphite: "#fdf6e8",
  vermillion: "#fdf6e8",
};

export interface FolderTabProps {
  id: string;
  name: string;
  accent?: FolderAccent;
  count?: number | null;
  isInbox?: boolean;
  active?: boolean;
  variant?: "strip" | "grid";
  onClick?: () => void;
  /** Right-side slot for action menu trigger (DropdownMenu trigger). */
  actions?: React.ReactNode;
  className?: string;
}

export function FolderTab({
  id,
  name,
  accent = "manila",
  count,
  isInbox = false,
  active = false,
  variant = "grid",
  onClick,
  actions,
  className,
}: FolderTabProps) {
  const tilt = active ? 0 : tiltFromId(`folder:${id}`, 1);
  const Icon = isInbox ? InboxIcon : Folder01Icon;

  const isStrip = variant === "strip";

  return (
    <div
      className={cn(
        "group/folder relative inline-block transition-all duration-200",
        active ? "z-10" : "hover:-translate-y-1",
        isStrip ? "h-12" : "h-32",
        className
      )}
      style={{ transform: active ? "translateY(-2px)" : `rotate(${tilt}deg)` }}
    >
      <button
        type="button"
        onClick={onClick}
        className={cn(
          "relative block h-full w-full text-left focus-visible:outline-none",
          isStrip ? "min-w-36 px-3" : "min-w-48 px-4 pb-3"
        )}
        aria-pressed={active}
      >
        {/* Body */}
        <RoughBox
          shape="folder-tab"
          seed={`folder-body:${id}`}
          stroke="var(--color-ink-soft)"
          strokeWidth={1.6}
          fill="var(--color-paper-elev)"
          fillStyle="solid"
          roughness={1.0}
          bowing={1}
          tabHeight={isStrip ? 14 : 22}
          tabWidth={isStrip ? 0.42 : 0.36}
          tabSlope={isStrip ? 7 : 10}
        />
        {/* Tab accent strip — small RoughBox positioned over the tab area */}
        <span
          aria-hidden
          className="pointer-events-none absolute left-0 top-0"
          style={{
            width: `calc(${isStrip ? "42%" : "36%"} + 2px)`,
            height: isStrip ? 14 : 22,
          }}
        >
          <RoughBox
            shape="rect"
            seed={`folder-tab:${id}`}
            stroke={ACCENT_FILL[accent]}
            strokeWidth={1.2}
            fill={ACCENT_FILL[accent]}
            fillStyle="solid"
            roughness={0.8}
            bowing={1}
          />
        </span>

        {/* Drop shadow on hover */}
        <span
          aria-hidden
          className={cn(
            "pointer-events-none absolute inset-0 -z-10 rounded-md transition-opacity duration-200",
            "shadow-[0_8px_24px_-8px_rgba(28,24,20,0.25)]",
            active
              ? "opacity-100"
              : "opacity-0 group-hover/folder:opacity-100"
          )}
        />

        {/* Content */}
        <span
          className={cn(
            "relative flex h-full flex-col justify-end gap-0.5",
            isStrip ? "pt-3 pb-1.5" : "pt-7"
          )}
        >
          <span
            className={cn(
              "flex items-center gap-1.5 font-heading leading-tight",
              isStrip ? "text-[0.8rem]" : "text-base",
              "text-ink"
            )}
            style={{ color: ACCENT_TEXT[accent] === "#fdf6e8" && active ? undefined : undefined }}
          >
            <HugeiconsIcon
              icon={Icon}
              strokeWidth={1.6}
              className={cn(isStrip ? "size-3.5" : "size-4", "shrink-0 text-ink-soft")}
            />
            <span className="truncate">{name}</span>
          </span>
          {!isStrip && (
            <span className="font-hand text-sm text-ink-muted">
              {count == null ? "—" : count === 1 ? "1 scene" : `${count} scenes`}
            </span>
          )}
        </span>
      </button>

      {/* Right-side actions (overlaid, not inside the button) */}
      {actions && !isStrip && (
        <div className="absolute right-2 top-7 opacity-0 transition-opacity duration-200 group-hover/folder:opacity-100">
          {actions}
        </div>
      )}
    </div>
  );
}
