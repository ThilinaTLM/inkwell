// Real preview for a file card: server thumbnail → markdown excerpt (notes) →
// kind icon. Excerpts are fetched lazily, only once the card scrolls into view.

import { File01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { FileKindGlyph } from "@/components/icons/file-kind-icons";
import { files } from "@/lib/api/client";
import { cn } from "@/lib/utils";
import type { CollectionItem } from "./model";

function useInView<T extends Element>(): [React.RefObject<T | null>, boolean] {
  const ref = useRef<T | null>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || seen) return;
    if (typeof IntersectionObserver === "undefined") {
      setSeen(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setSeen(true);
          io.disconnect();
        }
      },
      { rootMargin: "200px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [seen]);
  return [ref, seen];
}

/** Strip the most common Markdown syntax for a plain-text excerpt. */
export function markdownExcerpt(source: string, max = 260): string {
  const text = source
    .replace(/^---[\s\S]*?\n---\s*/, "")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^\s{0,3}(#{1,6}|>|[-*+]|\d+\.)\s+/gm, "")
    .replace(/[*_`~]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > max ? `${text.slice(0, max).trimEnd()}…` : text;
}

function useNoteExcerpt(item: CollectionItem, enabled: boolean): string | null {
  const q = useQuery({
    queryKey: ["collection", "excerpt", item.id, item.updatedAt],
    enabled: enabled && item.kind === "notes",
    staleTime: 5 * 60_000,
    retry: false,
    queryFn: async () => {
      const loaded = await files.load(item.id);
      const blob = loaded.blob;
      if (blob.kind === "notes" && "source" in blob) return markdownExcerpt(blob.source);
      return "";
    },
  });
  return q.data || null;
}

export function KindIcon({ item, className }: { item: CollectionItem; className?: string }) {
  if (item.kind === "file" || item.kind === "folder") {
    return (
      <HugeiconsIcon
        icon={File01Icon}
        strokeWidth={1.5}
        className={cn("text-muted-foreground", className)}
      />
    );
  }
  return <FileKindGlyph kind={item.kind} variant="mark" className={className} />;
}

export function CollectionPreview({
  item,
  className,
}: {
  item: CollectionItem;
  className?: string;
}) {
  const [ref, inView] = useInView<HTMLDivElement>();
  const [broken, setBroken] = useState(false);
  const excerpt = useNoteExcerpt(item, inView && !(item.thumbUrl && !broken));
  const showThumb = !!item.thumbUrl && !broken;

  return (
    <div
      ref={ref}
      className={cn("relative overflow-hidden bg-surface-2", className)}
      aria-hidden="true"
    >
      {showThumb ? (
        <img
          src={item.thumbUrl ?? undefined}
          alt=""
          loading="lazy"
          draggable={false}
          onError={() => setBroken(true)}
          className="ink-thumb-img size-full object-contain p-1.5"
        />
      ) : excerpt ? (
        <p className="size-full overflow-hidden px-3.5 pt-3 text-[11px] leading-[1.55] text-muted-foreground [mask-image:linear-gradient(to_bottom,black_60%,transparent)]">
          {excerpt}
        </p>
      ) : (
        <div className="grid size-full place-items-center">
          <KindIcon item={item} className="size-9 opacity-70" />
        </div>
      )}
    </div>
  );
}
