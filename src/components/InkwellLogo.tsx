// InkwellLogo — the brand lockup: <InkwellMark> + <InkwellWordmark>.
//
// Use this everywhere the brand appears next to its name (top bars,
// auth card, public share pages) so the mark-to-wordmark proportions
// stay consistent. For the mark alone use <InkwellMark>; for the
// full-screen loading experience use <InkwellSplash>.

import { InkwellMark } from "@/components/InkwellMark";
import { InkwellWordmark } from "@/components/InkwellWordmark";
import { cn } from "@/lib/utils";

type LogoSize = "sm" | "md" | "lg";

const SIZES: Record<LogoSize, { mark: string; wordmark: string; gap: string }> = {
  sm: { mark: "size-5", wordmark: "h-4", gap: "gap-2" },
  md: { mark: "size-6", wordmark: "h-5", gap: "gap-2.5" },
  lg: { mark: "size-10", wordmark: "h-8", gap: "gap-3" },
};

interface InkwellLogoProps {
  size?: LogoSize;
  /** Animate the mark (pen dip + ink ripple). */
  animate?: boolean;
  className?: string;
  /** Extra classes for the wordmark, e.g. `hidden sm:block` to hide it on phones. */
  wordmarkClassName?: string;
}

export function InkwellLogo({
  size = "sm",
  animate = false,
  className,
  wordmarkClassName,
}: InkwellLogoProps) {
  const s = SIZES[size];
  return (
    <span className={cn("inline-flex items-center", s.gap, className)}>
      <InkwellMark animate={animate} className={s.mark} />
      {/* Optical alignment: Excalifont's descender sits below the baseline. */}
      <InkwellWordmark className={cn(s.wordmark, "translate-y-[4%]", wordmarkClassName)} />
    </span>
  );
}
