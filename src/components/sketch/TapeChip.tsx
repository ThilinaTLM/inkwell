// TapeChip — a washi-tape style tag chip. Two states:
//   active   — the tag is filtering the view (filled tape with ink label)
//   inactive — toggleable (translucent tape outline)
//
// Color is deterministic per tag name (FNV hash → palette index) so users
// recognize their tags by color over time.

import * as React from "react";
import { cn } from "@/lib/utils";
import { RoughBox } from "@/components/rough";
import { pickFromPalette, tiltFromId } from "./tilt";

const TAPE_PALETTE = [
  "var(--color-tape-yellow)",
  "var(--color-tape-pink)",
  "var(--color-tape-green)",
  "var(--color-tape-blue)",
  "var(--color-tape-purple)",
] as const;

export interface TapeChipProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "type"> {
  label: string;
  active?: boolean;
  /** Render as a non-interactive span (e.g. inside a card). */
  asStatic?: boolean;
  /** Override the tape color; otherwise picked from palette by label. */
  color?: string;
  size?: "sm" | "md";
}

export function TapeChip({
  label,
  active = false,
  asStatic = false,
  color,
  size = "md",
  className,
  ...rest
}: TapeChipProps) {
  const tape = color ?? pickFromPalette(label, TAPE_PALETTE);
  const tilt = tiltFromId(label, 1.5);

  const inner = (
    <span
      className={cn(
        "relative inline-flex items-center justify-center font-sans select-none whitespace-nowrap",
        size === "sm"
          ? "px-2.5 py-0.5 text-[0.6875rem]"
          : "px-3 py-1 text-xs",
        active ? "text-ink font-medium" : "text-ink-soft"
      )}
      style={{ transform: `rotate(${tilt}deg)` }}
    >
      <RoughBox
        shape="rect"
        seed={`tape:${label}:${active ? "on" : "off"}`}
        stroke={active ? "var(--color-ink)" : "var(--color-ink-soft)"}
        strokeWidth={active ? 1.4 : 1}
        fill={active ? tape : "transparent"}
        fillStyle="solid"
        roughness={1.4}
        bowing={2}
      />
      <span className="relative">{label}</span>
    </span>
  );

  if (asStatic) {
    return <span className={cn("inline-block", className)}>{inner}</span>;
  }

  return (
    <button
      type="button"
      className={cn(
        "inline-block transition-transform duration-150 hover:-translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 rounded",
        className
      )}
      {...rest}
    >
      {inner}
    </button>
  );
}
