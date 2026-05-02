// TagFilterStrip — a horizontal strip of TapeChips representing every tag
// in the user's namespace. Clicking a chip toggles whether that tag
// participates in the dashboard filter (intersection semantics, handled
// by the parent).

import { HugeiconsIcon } from "@hugeicons/react";
import { HashtagIcon } from "@hugeicons/core-free-icons";
import type { Tag } from "@/lib/api/client";
import { TapeChip } from "./TapeChip";

interface TagFilterStripProps {
  tags: Tag[] | null;
  active: string[];
  onToggle: (name: string) => void;
}

export function TagFilterStrip({ tags, active, onToggle }: TagFilterStripProps) {
  if (tags === null) {
    return (
      <div className="flex items-center gap-2 px-6 py-2 text-ink-muted">
        <HugeiconsIcon icon={HashtagIcon} strokeWidth={1.6} className="size-3.5" />
        <span className="font-hand text-sm">loading tags…</span>
      </div>
    );
  }
  if (tags.length === 0) return null;

  return (
    <div
      role="toolbar"
      aria-label="Filter by tag"
      className="flex flex-wrap items-center gap-2 px-6 py-2"
    >
      <HugeiconsIcon
        icon={HashtagIcon}
        strokeWidth={1.6}
        className="size-3.5 text-ink-muted"
      />
      {tags.map((t) => (
        <TapeChip
          key={t.id}
          label={t.name}
          active={active.includes(t.name)}
          size="sm"
          onClick={() => onToggle(t.name)}
        />
      ))}
    </div>
  );
}
