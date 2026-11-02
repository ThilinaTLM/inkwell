// Quick look overlay (Space) for collection pages. Opens from `quickLookStore`
// (the `item.quickLook` command). ←/→ page through the visible items, Space /
// Esc close, ↵ opens. Notes show a text excerpt, images the raw file, boards /
// diagrams / sites their thumbnail, folders a summary.

import { ArrowLeft01Icon, ArrowRight01Icon, Cancel01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { ProjectIcon } from "@/components/project/ProjectIcon";
import { Kbd } from "@/components/shell/Kbd";
import { Button } from "@/components/ui/button";
import { files } from "@/lib/api/client";
import { quickLookStore, useQuickLookRequest } from "@/lib/commands/signals";
import { relTime } from "@/lib/format";
import { CollectionPreview, isImageFile, KindIcon, markdownExcerpt } from "./CollectionPreview";
import { type CollectionItem, formatBytes, kindLabel } from "./model";

function NoteBody({ item }: { item: CollectionItem }) {
  const q = useQuery({
    queryKey: ["collection", "quick-look-note", item.id, item.updatedAt],
    staleTime: 60_000,
    retry: false,
    queryFn: async () => {
      const loaded = await files.load(item.id);
      const blob = loaded.blob;
      return blob.kind === "notes" && "source" in blob ? blob.source : "";
    },
  });
  if (q.isPending) return <p className="text-sm text-muted-foreground">Loading…</p>;
  const text = markdownExcerpt(q.data ?? "", 1800);
  return text ? (
    <p className="mx-auto max-w-prose text-[15px] leading-relaxed text-foreground">{text}</p>
  ) : (
    <p className="text-center text-sm text-muted-foreground">This note is empty.</p>
  );
}

function Body({ item }: { item: CollectionItem }) {
  if (item.type === "folder") {
    return (
      <div className="grid h-full place-items-center gap-2 text-center">
        <div className="grid justify-items-center gap-3">
          {item.folder ? <ProjectIcon folder={item.folder} size="lg" /> : null}
          <p className="font-display text-xl">{item.name}</p>
          <p className="text-sm text-muted-foreground">
            {item.itemCount ?? 0} {item.itemCount === 1 ? "item" : "items"}
          </p>
        </div>
      </div>
    );
  }
  if (item.kind === "notes") return <NoteBody item={item} />;
  if (isImageFile(item)) {
    return (
      <img
        src={files.rawUrl(item.id)}
        alt={item.name}
        className="mx-auto max-h-full max-w-full object-contain"
      />
    );
  }
  return <CollectionPreview item={item} className="size-full rounded-lg" />;
}

export function QuickLook({
  items,
  onOpen,
  onStep,
}: {
  items: CollectionItem[];
  onOpen: (item: CollectionItem) => void;
  /** Keep the page selection in sync while paging. */
  onStep?: (item: CollectionItem) => void;
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
    onStep?.(next);
  };

  return createPortal(
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-[oklch(0.18_0.012_60_/_0.55)] p-6 backdrop-blur-xs"
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
            onOpen(item);
          }
        }}
        className="flex max-h-full w-[min(880px,100%)] flex-col overflow-hidden rounded-2xl bg-popover text-popover-foreground shadow-[0_24px_60px_-20px_rgba(28,24,20,0.45)] ring-1 ring-border outline-none"
      >
        <div className="flex items-center gap-2.5 border-b border-border px-4 py-2.5">
          <KindIcon item={item} className="size-5 shrink-0" />
          <span className="truncate font-display text-base font-medium">{item.name}</span>
          <span className="shrink-0 text-xs text-muted-foreground">
            {kindLabel(item.kind)}
            {item.sizeBytes ? ` · ${formatBytes(item.sizeBytes)}` : ""} · {relTime(item.updatedAt)}
          </span>
          <span className="flex-1" />
          <span className="text-xs text-faint tabular-nums">
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
        <div className="h-[min(56vh,520px)] min-h-0 overflow-auto bg-background p-5">
          <Body item={item} />
        </div>
        <div className="flex items-center gap-4 border-t border-border px-4 py-2 text-[11.5px] text-muted-foreground">
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
