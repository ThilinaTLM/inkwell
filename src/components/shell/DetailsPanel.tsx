// Right-hand details column slot.
//
// PUBLIC CONTRACT
//   <DetailsPanel title?: string actions?: ReactNode>{children}</DetailsPanel>
//     Pages render this anywhere in their tree; the content is portalled
//     into the shell's right column (300px) and is visible only while
//     `detailsOpen` (toggled with `I` / `view.details`). Below 768px it
//     renders as a bottom-sheet Drawer instead. Only one panel should be
//     mounted at a time; if none is mounted the column is hidden.

import { Cancel01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { type ReactNode, useEffect } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer";
import { createStore, useStore } from "@/lib/store";
import { setDetailsOpen, useShellState } from "./shellStore";

/** Registered by AppShell: the right-column DOM node + mounted panel count. */
export const detailsSlotStore = createStore<{ el: HTMLElement | null; count: number }>({
  el: null,
  count: 0,
});

export function DetailsPanel({
  title = "Details",
  actions,
  children,
}: {
  title?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const el = useStore(detailsSlotStore, (s) => s.el);
  const open = useShellState((s) => s.detailsOpen);
  const isMobile = useShellState((s) => s.isMobile);

  useEffect(() => {
    detailsSlotStore.set((s) => ({ ...s, count: s.count + 1 }));
    return () => detailsSlotStore.set((s) => ({ ...s, count: s.count - 1 }));
  }, []);

  const header = (
    <div className="flex items-center gap-1.5 pb-1">
      <span className="text-[11px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
        {title}
      </span>
      <span className="flex-1" />
      {actions}
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Close details panel"
        onClick={() => setDetailsOpen(false)}
      >
        <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} />
      </Button>
    </div>
  );

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={(o) => setDetailsOpen(o)} swipeDirection="down">
        <DrawerContent side="bottom" className="px-4 pt-3 pb-4">
          <DrawerTitle className="sr-only">{title}</DrawerTitle>
          {header}
          <div className="min-h-0 overflow-y-auto">{children}</div>
        </DrawerContent>
      </Drawer>
    );
  }

  if (!el || !open) return null;
  return createPortal(
    <div className="flex min-h-0 flex-col p-3.5">
      {header}
      {children}
    </div>,
    el,
  );
}
