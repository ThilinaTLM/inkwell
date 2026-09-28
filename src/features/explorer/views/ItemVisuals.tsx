// Small visual building blocks shared by every view and the details
// panel / quick look: kind icon, thumbnail frame, tag pills, badges.

import { Link04Icon, StarIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useState } from "react";
import { FileKindBadge, FileKindGlyph } from "@/components/icons/file-kind-icons";
import { tagColor } from "@/components/shell/tagColor";
import { cn } from "@/lib/utils";
import type { ExplorerItem, ItemKind } from "../model";

export function FolderGlyph({ className, open }: { className?: string; open?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={cn("size-[18px] shrink-0", className)}>
      <path
        d="M2 6.5A1.5 1.5 0 0 1 3.5 5h5.2l2 2h9.8A1.5 1.5 0 0 1 22 8.5v10a1.5 1.5 0 0 1-1.5 1.5h-17A1.5 1.5 0 0 1 2 18.5z"
        fill="#e0762c"
      />
      <path
        d={
          open
            ? "M3.5 10h19l-2 8.5a1.5 1.5 0 0 1-1.5 1.5h-16z"
            : "M2 9h20v9.5a1.5 1.5 0 0 1-1.5 1.5h-17A1.5 1.5 0 0 1 2 18.5z"
        }
        fill="var(--color-folder, #f5893a)"
      />
    </svg>
  );
}

export function ItemIcon({ kind, className }: { kind: ItemKind; className?: string }) {
  if (kind === "folder") return <FolderGlyph className={className} />;
  return <FileKindBadge kind={kind} className={cn("size-[18px] rounded-[5px]", className)} />;
}

/** Thumbnail frame: server thumb when available, else a large kind mark. */
export function ItemThumb({
  item,
  className,
  large,
}: {
  item: ExplorerItem;
  className?: string;
  large?: boolean;
}) {
  const [broken, setBroken] = useState(false);
  if (item.type === "folder") {
    return (
      <div className={cn("relative grid place-items-center", className)}>
        <svg viewBox="0 0 160 112" aria-hidden className="h-full w-full">
          <path
            d="M14 22a6 6 0 0 1 6-6h36l10 10h74a6 6 0 0 1 6 6v62a6 6 0 0 1-6 6H20a6 6 0 0 1-6-6z"
            fill="#d86d25"
          />
          <rect x="24" y="28" width="112" height="44" rx="3" fill="var(--color-card, #efe9dc)" />
          {item.thumbUrl && !broken ? null : (
            <>
              <rect x="32" y="36" width="60" height="4" rx="2" fill="currentColor" opacity=".25" />
              <rect x="32" y="45" width="84" height="4" rx="2" fill="currentColor" opacity=".18" />
            </>
          )}
          <path
            d="M14 46h132v48a6 6 0 0 1-6 6H20a6 6 0 0 1-6-6z"
            fill="var(--color-folder, #f5893a)"
          />
        </svg>
        {item.thumbUrl && !broken ? (
          <img
            src={item.thumbUrl}
            alt=""
            loading="lazy"
            draggable={false}
            onError={() => setBroken(true)}
            className="absolute top-[25%] left-[15%] h-[16%] w-[70%] object-cover object-top opacity-90"
          />
        ) : null}
      </div>
    );
  }
  return (
    <div
      className={cn(
        "relative grid place-items-center overflow-hidden rounded-lg border border-border bg-card",
        className,
      )}
    >
      {item.thumbUrl && !broken ? (
        <img
          src={item.thumbUrl}
          alt=""
          loading="lazy"
          draggable={false}
          onError={() => setBroken(true)}
          className="h-full w-full object-contain p-1.5 dark:invert-[.04]"
        />
      ) : (
        <FileKindGlyph
          kind={item.kind as Exclude<ItemKind, "folder">}
          variant="mark"
          className={large ? "size-16 opacity-80" : "size-9 opacity-70"}
        />
      )}
    </div>
  );
}

export function TagPill({
  tag,
  onRemove,
  className,
}: {
  tag: string;
  onRemove?: () => void;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-5 max-w-40 items-center gap-1 rounded-full bg-muted px-2 text-[11px] text-muted-foreground",
        className,
      )}
    >
      <span
        aria-hidden
        className="size-1.5 shrink-0 rounded-full"
        style={{ background: tagColor(tag) }}
      />
      <span className="truncate">{tag}</span>
      {onRemove ? (
        <button
          type="button"
          aria-label={`Remove tag ${tag}`}
          onClick={onRemove}
          className="-mr-1 ml-0.5 rounded-full px-1 leading-none hover:bg-border hover:text-foreground"
        >
          ×
        </button>
      ) : null}
    </span>
  );
}

export function StarMark({ className }: { className?: string }) {
  return (
    <HugeiconsIcon
      icon={StarIcon}
      strokeWidth={2}
      className={cn("size-3 shrink-0 fill-primary text-primary", className)}
      aria-label="Starred"
    />
  );
}

export function ItemBadges({ item }: { item: ExplorerItem }) {
  if (!item.starred && item.shareCount === 0) return null;
  return (
    <div className="pointer-events-none absolute top-3.5 right-3.5 flex gap-1">
      {item.starred ? (
        <span className="grid h-[18px] min-w-[18px] place-items-center rounded-[5px] bg-black/55 px-1 text-accent">
          <HugeiconsIcon icon={StarIcon} strokeWidth={2} className="size-[11px] fill-current" />
        </span>
      ) : null}
      {item.shareCount > 0 ? (
        <span
          title={`${item.shareCount} active link${item.shareCount === 1 ? "" : "s"}`}
          className="grid h-[18px] min-w-[18px] place-items-center rounded-[5px] bg-black/55 px-1 text-accent"
        >
          <HugeiconsIcon icon={Link04Icon} strokeWidth={2} className="size-[11px]" />
        </span>
      ) : null}
    </div>
  );
}
