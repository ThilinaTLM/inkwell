// InkwellSplash — full-screen brand splash / loading screen.
//
// Composition (all CSS-driven, see "Inkwell brand animations" in
// src/index.css):
//   · a faint Excalidraw-style dot grid, faded out towards the edges
//   · the animated mark: the pen dips into the well, the ink ripples
//     (loops for as long as the splash is visible, acting as the spinner)
//   · the wordmark "written" left→right, then underlined in brand orange
//     (plays once)
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
  /** Play the write-in + underline intro. */
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
      <div aria-hidden className="ink-splash-grid pointer-events-none absolute inset-0" />
      <div aria-hidden className="relative flex flex-col items-center gap-7">
        <InkwellMark animate className="size-28" />
        <div className="flex flex-col items-center gap-1">
          <InkwellWordmark className={cn("h-12", intro && "ink-write")} />
          <svg
            viewBox="0 0 156 12"
            fill="none"
            className="h-3 w-[156px] overflow-visible text-primary"
            aria-hidden
          >
            <path
              d="M5 7 C40 2 100 3 151 6"
              stroke="currentColor"
              strokeWidth={3.5}
              strokeLinecap="round"
              pathLength={1}
              className={intro ? "ink-underline" : undefined}
            />
          </svg>
        </div>
      </div>
      <span className="sr-only">{label}</span>
    </div>
  );
}
