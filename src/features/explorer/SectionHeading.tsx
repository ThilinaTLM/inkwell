// SectionHeading — captioned divider used to separate sections in the
// explorer body (e.g. "Folders" / "Scenes" in Browse).
//
// Renders a small uppercase label, an optional count, and a hairline
// rule that stretches to the right edge of the row.

interface SectionHeadingProps {
  label: string;
  count?: number;
}

export function SectionHeading({ label, count }: SectionHeadingProps) {
  return (
    <div className="flex items-baseline gap-3 px-6 pb-2 pt-4">
      <h2 className="font-heading text-sm uppercase tracking-wide text-ink-soft">{label}</h2>
      {count != null ? <span className="text-xs text-ink-muted">{count}</span> : null}
      <div className="ml-2 flex-1 border-t border-ink-soft/15" />
    </div>
  );
}
