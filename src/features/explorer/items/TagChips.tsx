// TagChips — the tag presentation shared by grid cards and list rows.
//
// Colour is deterministic: the tag name hashes into one of the five
// `--tag-*` swatches, so a tag keeps the same colour everywhere without
// storing one. Chips are quiet by default (tinted fill + hairline ring)
// and link to the tag view.

import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";

const SWATCHES = [
  "bg-tag-1/12 text-tag-1 ring-tag-1/25",
  "bg-tag-2/12 text-tag-2 ring-tag-2/25",
  "bg-tag-3/12 text-tag-3 ring-tag-3/25",
  "bg-tag-4/12 text-tag-4 ring-tag-4/25",
  "bg-tag-5/12 text-tag-5 ring-tag-5/25",
] as const;

const DOTS = ["bg-tag-1", "bg-tag-2", "bg-tag-3", "bg-tag-4", "bg-tag-5"] as const;

function swatchIndex(tag: string): number {
  let h = 0;
  for (let i = 0; i < tag.length; i++) h = (h * 31 + tag.charCodeAt(i)) >>> 0;
  return h % SWATCHES.length;
}

export function TagChip({
  tag,
  interactive = true,
  className,
}: {
  tag: string;
  interactive?: boolean;
  className?: string;
}) {
  const classes = cn(
    "inline-flex max-w-full items-center rounded-full px-1.5 py-0.5 text-[0.6875rem] font-medium leading-none ring-1",
    SWATCHES[swatchIndex(tag)],
    className,
  );
  if (!interactive) return <span className={classes}>{tag}</span>;
  return (
    <Link
      to={`/tags/${encodeURIComponent(tag)}`}
      onClick={(e) => e.stopPropagation()}
      className={cn(classes, "transition-opacity hover:opacity-80")}
    >
      <span className="truncate">{tag}</span>
    </Link>
  );
}

/** Compact colour dots, used where a full chip row would be too noisy. */
export function TagDots({ tags, className }: { tags: string[]; className?: string }) {
  if (tags.length === 0) return null;
  return (
    <span className={cn("inline-flex items-center gap-0.5", className)} title={tags.join(", ")}>
      {tags.slice(0, 4).map((t) => (
        <span key={t} className={cn("size-1.5 rounded-full", DOTS[swatchIndex(t)])} />
      ))}
    </span>
  );
}

export function TagChipRow({
  tags,
  max = 3,
  className,
}: {
  tags: string[];
  max?: number;
  className?: string;
}) {
  if (tags.length === 0) return null;
  const shown = tags.slice(0, max);
  const rest = tags.length - shown.length;
  return (
    <span className={cn("flex min-w-0 flex-wrap items-center gap-1", className)}>
      {shown.map((t) => (
        <TagChip key={t} tag={t} />
      ))}
      {rest > 0 ? <span className="text-[0.6875rem] text-muted-foreground">+{rest}</span> : null}
    </span>
  );
}
