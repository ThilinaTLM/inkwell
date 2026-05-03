// Editor chrome — full-page loading and error states, plus the
// back-to-dashboard button that floats next to Excalidraw's hamburger.
//
// These were inline in EditorPage; lifted here so SharedEditor can
// reuse them and EditorPage stays focused on data + actions.

import { Alert02Icon, ArrowLeft01Icon, Loading03Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Link, useNavigate } from "react-router-dom";
import { PaperSurface } from "@/components/PaperSurface";
import { Button } from "@/components/ui/button";

/**
 * 36×36 paper-pill button mirroring Excalidraw's hamburger footprint,
 * surfacing the most common navigation (back to the scene list) without
 * having to open the MainMenu first.
 */
export function BackToScenesButton() {
  const navigate = useNavigate();
  return (
    <button
      type="button"
      title="Back to scenes"
      aria-label="Back to scenes"
      onClick={() => navigate("/")}
      className="pointer-events-auto inline-flex h-9 w-9 items-center justify-center rounded-md bg-paper-elev/90 text-ink-soft ring-1 ring-ink-soft/15 backdrop-blur transition hover:bg-paper-elev hover:text-ink"
    >
      <HugeiconsIcon icon={ArrowLeft01Icon} strokeWidth={1.8} className="size-4" />
    </button>
  );
}

export function EditorLoadingState({ label }: { label: string }) {
  return (
    <PaperSurface variant="page" className="grid place-items-center text-ink-soft">
      <div className="flex items-center gap-2 text-sm">
        <HugeiconsIcon icon={Loading03Icon} strokeWidth={2} className="size-4 animate-spin" />
        {label}
      </div>
    </PaperSurface>
  );
}

export function EditorErrorState({ message }: { message: string }) {
  return (
    <PaperSurface variant="page" className="grid place-items-center px-4">
      <div
        className="flex max-w-sm flex-col items-center gap-3 rounded-lg bg-paper-elev p-6 text-center text-ink ring-1 ring-ink-soft/15"
        style={{ transform: "rotate(-0.6deg)" }}
      >
        <HugeiconsIcon icon={Alert02Icon} strokeWidth={2} className="size-6 text-vermillion" />
        <div className="space-y-1">
          <div className="font-heading text-lg">Couldn't load this scene</div>
          <p className="text-sm text-ink-soft">{message}</p>
        </div>
        <Button variant="outline" size="sm" render={<Link to="/" />}>
          <HugeiconsIcon icon={ArrowLeft01Icon} strokeWidth={2} />
          Back to dashboard
        </Button>
      </div>
    </PaperSurface>
  );
}
