// Quick look overlay (Space). Opens from `quickLookStore` (the
// `item.quickLook` command); ←/→ page through `items`, Space / Esc
// close, ↵ opens. Folders show their summary.

import { ArrowLeft01Icon, ArrowRight01Icon, Cancel01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Kbd } from "@/components/shell/Kbd";
import { Button } from "@/components/ui/button";
import { quickLookStore, useQuickLookRequest } from "@/lib/commands/signals";
import type { ExplorerItem } from "./model";
import { dispatchSelection } from "./state";
import { itemSubtitle } from "./views/ItemPreview";
import { ItemIcon, ItemThumb } from "./views/ItemVisuals";

export function QuickLook({
  items,
  scope,
  onOpen,
}: {
  items: ExplorerItem[];
  scope?: string;
  onOpen?: (item: ExplorerItem) => void;
}) {
  const req = useQuickLookRequest();
  const ref = useRef<HTMLDivElement>(null);
  const idx = req.item
    ? items.findIndex((i) => i.type === req.item?.type && i.id === req.item.id)
    : -1;
  const item = req.open && idx >= 0 ? items[idx] : null;
  const lastFocus = useRef<Element | null>(null);

  const itemKey = item?.key ?? null;
  useEffect(() => {
    if (!itemKey) return;
    lastFocus.current = document.activeElement;
    ref.current?.focus();
    return () => {
      (lastFocus.current as HTMLElement | null)?.focus?.();
    };
  }, [itemKey]);

  if (!item) return null;

  const close = () => quickLookStore.set((s) => ({ ...s, open: false }));
  const step = (d: number) => {
    const next = items[(idx + d + items.length) % items.length];
    if (!next) return;
    quickLookStore.set((s) => ({ ...s, item: next.ref, nonce: s.nonce + 1 }));
    if (scope) dispatchSelection(scope, { type: "set", keys: [next.key], focus: next.key });
  };

  return createPortal(
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-6 backdrop-blur-[2px]"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={`Quick look: ${item.name}`}
        tabIndex={-1}
        data-quick-look=""
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Escape" || e.key === " ") {
            e.preventDefault();
            close();
          } else if (e.key === "ArrowRight" || e.key === "ArrowDown") {
            e.preventDefault();
            step(1);
          } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
            e.preventDefault();
            step(-1);
          } else if (e.key === "Enter") {
            e.preventDefault();
            close();
            onOpen?.(item);
          }
        }}
        className="flex max-h-full w-[min(920px,100%)] flex-col overflow-hidden rounded-2xl border border-border bg-popover shadow-2xl outline-none"
      >
        <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
          <ItemIcon kind={item.kind} />
          <span className="truncate font-semibold">{item.name}</span>
          <span className="text-xs text-muted-foreground">{itemSubtitle(item)}</span>
          <span className="flex-1" />
          <span className="text-xs text-muted-foreground">
            {idx + 1} / {items.length}
          </span>
          <Button size="icon-sm" variant="ghost" aria-label="Previous" onClick={() => step(-1)}>
            <HugeiconsIcon icon={ArrowLeft01Icon} strokeWidth={2} />
          </Button>
          <Button size="icon-sm" variant="ghost" aria-label="Next" onClick={() => step(1)}>
            <HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={2} />
          </Button>
          <Button size="icon-sm" variant="ghost" aria-label="Close quick look" onClick={close}>
            <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} />
          </Button>
        </div>
        <div className="min-h-0 flex-1 bg-background p-4">
          <ItemThumb item={item} large className="h-[min(60vh,560px)] w-full" />
        </div>
        <div className="flex items-center gap-3 border-t border-border px-4 py-2 text-[11.5px] text-muted-foreground">
          <span className="flex items-center gap-1">
            <Kbd>←</Kbd>
            <Kbd>→</Kbd> browse
          </span>
          <span className="flex items-center gap-1">
            <Kbd>↵</Kbd> open
          </span>
          <span className="flex items-center gap-1">
            <Kbd>Space</Kbd> / <Kbd>Esc</Kbd> close
          </span>
        </div>
      </div>
    </div>,
    document.body,
  );
}
