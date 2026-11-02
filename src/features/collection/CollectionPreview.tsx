// Real preview for a file card: server thumbnail → markdown excerpt (notes) →
// kind icon. Excerpts are fetched lazily, only once the card scrolls into view.

import { File01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useQuery } from "@tanstack/react-query";
import { type ReactNode, useEffect, useRef, useState } from "react";
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

/** Split a note into its first heading (if any) and a plain excerpt of the rest. */
export function noteParts(source: string): { title: string | null; body: string } {
  const stripped = source.replace(/^---[\s\S]*?\n---\s*/, "");
  const m = /^\s{0,3}#{1,3}\s+(.+)$/m.exec(stripped);
  if (!m) return { title: null, body: markdownExcerpt(stripped, 220) };
  const title = m[1].replace(/[*_`~]/g, "").trim();
  const rest = stripped.slice(0, m.index) + stripped.slice(m.index + m[0].length);
  return { title, body: markdownExcerpt(rest, 200) };
}

const IMAGE_EXT = /\.(png|jpe?g|gif|webp|avif|svg|bmp)$/i;

export function extensionOf(name: string): string {
  const m = /\.([A-Za-z0-9]{1,5})$/.exec(name);
  return m ? m[1].toUpperCase() : "";
}

export function isImageFile(item: CollectionItem): boolean {
  return (
    item.kind === "file" && ((item.mime ?? "").startsWith("image/") || IMAGE_EXT.test(item.name))
  );
}

function useNoteParts(item: CollectionItem, enabled: boolean) {
  const q = useQuery({
    queryKey: ["collection", "note-parts", item.id, item.updatedAt],
    enabled: enabled && item.kind === "notes",
    staleTime: 5 * 60_000,
    retry: false,
    queryFn: async () => {
      const loaded = await files.load(item.id);
      const blob = loaded.blob;
      if (blob.kind === "notes" && "source" in blob) return noteParts(blob.source);
      return null;
    },
  });
  const d = q.data;
  return d && (d.title || d.body) ? d : null;
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
  const note = useNoteParts(item, inView);
  const image = isImageFile(item);
  const thumb = item.thumbUrl && !broken ? item.thumbUrl : null;

  let body: ReactNode;
  if (note) {
    // Paper-style excerpt: serif heading, quiet body, fades out at the bottom.
    body = (
      <div className="size-full overflow-hidden bg-card px-4 pt-3.5 [mask-image:linear-gradient(to_bottom,black_62%,transparent)]">
        {note.title ? (
          <h4 className="mb-1 line-clamp-2 font-display text-[15px] leading-snug font-medium text-foreground">
            {note.title}
          </h4>
        ) : null}
        {note.body ? (
          <p className="text-[11.5px] leading-[1.55] text-muted-foreground">{note.body}</p>
        ) : null}
      </div>
    );
  } else if (image && inView && !broken) {
    body = (
      <img
        src={files.rawUrl(item.id)}
        alt=""
        loading="lazy"
        draggable={false}
        onError={() => setBroken(true)}
        className="size-full object-cover"
      />
    );
  } else if (thumb && item.kind !== "file") {
    body = (
      <img
        src={thumb}
        alt=""
        loading="lazy"
        draggable={false}
        onError={() => setBroken(true)}
        className="ink-thumb-img size-full object-contain p-2"
      />
    );
  } else if (item.kind === "file") {
    const ext = extensionOf(item.name);
    body = (
      <div className="grid size-full place-items-center">
        <div className="relative grid h-[62px] w-12 place-items-center rounded-md border border-border bg-card shadow-card">
          <HugeiconsIcon
            icon={File01Icon}
            strokeWidth={1.4}
            className="size-6 text-muted-foreground"
          />
          {ext ? (
            <span className="absolute -right-2 -bottom-1.5 rounded bg-foreground px-1 py-px text-[9px] leading-none font-semibold tracking-wide text-background">
              {ext}
            </span>
          ) : null}
        </div>
      </div>
    );
  } else {
    body = (
      <div className="grid size-full place-items-center">
        <KindIcon item={item} className="size-9 opacity-70" />
      </div>
    );
  }

  return (
    <div
      ref={ref}
      className={cn("relative overflow-hidden bg-surface-2", className)}
      aria-hidden="true"
    >
      {body}
    </div>
  );
}
