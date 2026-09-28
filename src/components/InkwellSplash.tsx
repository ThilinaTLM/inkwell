// InkwellSplash — full-screen brand splash / loading screen.
//
// Composition (all CSS-driven, see "Inkwell brand animations" in
// src/index.css):
//   · the animated mark: the pen dips into the well, the ink ripples
//     (loops for as long as the splash is visible, acting as the spinner)
//   · the wordmark revealed left→right (plays once)
//
// index.html renders a static, pre-JS copy of this screen inside #root
// (`#boot-splash`) with identical sizing, so the hand-off to React is
// seamless. When that happened, pass `intro={false}` so the write-in
// doesn't replay.
//
// `prefers-reduced-motion` shows the final composed frame.

import { InkwellMark } from "@/components/InkwellMark";
import { InkwellWordmark } from "@/components/InkwellWordmark";
import { cn } from "@/lib/utils";

interface InkwellSplashProps {
  /** Screen-reader status text. */
  label?: string;
  /** Play the write-in intro. */
  intro?: boolean;
  className?: string;
}

export function InkwellSplash({
  label = "Loading Inkwell…",
  intro = true,
  className,
}: InkwellSplashProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "relative grid min-h-dvh place-items-center overflow-hidden bg-background text-foreground",
        className,
      )}
    >
      <div aria-hidden className="relative flex flex-col items-center gap-7">
        <InkwellMark animate className="size-28" />
        <InkwellWordmark className={cn("h-11", intro && "ink-write")} />
      </div>
      <span className="sr-only">{label}</span>
    </div>
  );
}
