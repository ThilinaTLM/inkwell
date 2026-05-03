// Editor chrome — full-page loading and error states.
//
// These are page-level placeholders shown while the scene query is in
// flight or has failed; they sit at the route level (not inside
// `<SceneEditor>`), which is why they're standalone here rather than
// part of SceneEditor itself. Lifted out of EditorPage so SharedEditor
// can reuse them.
//
// The previous "back to scenes" floating pill lived here too; it has
// been replaced by a native `MainMenu.Item` ("Back to dashboard") in
// each consumer page, so there's no longer a chrome pill component
// for this file to host.

import { Alert02Icon, ArrowLeft01Icon, Loading03Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Link } from "react-router-dom";
import { PaperSurface } from "@/components/PaperSurface";
import { Button } from "@/components/ui/button";

export function EditorLoadingState({ label }: { label: string }) {
  return (
    <PaperSurface variant="page" className="grid place-items-center text-muted-foreground">
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
        className="flex max-w-sm flex-col items-center gap-3 rounded-lg bg-card p-6 text-center text-card-foreground ring-1 ring-border"
        style={{ transform: "rotate(-0.6deg)" }}
      >
        <HugeiconsIcon icon={Alert02Icon} strokeWidth={2} className="size-6 text-destructive" />
        <div className="space-y-1">
          <div className="font-heading text-lg">Couldn't load this scene</div>
          <p className="text-sm text-muted-foreground">{message}</p>
        </div>
        <Button variant="outline" size="sm" render={<Link to="/" />}>
          <HugeiconsIcon icon={ArrowLeft01Icon} strokeWidth={2} />
          Back to dashboard
        </Button>
      </div>
    </PaperSurface>
  );
}
