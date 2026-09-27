// Optional human-readable label for a share link (max 200 chars — the
// worker's column limit). Trimming / empty → null is the caller's job.
// `onCommit` fires on blur and ↵ (used by the autosaving details panel).

import { Input } from "@/components/ui/input";

export function LabelField({
  value,
  onChange,
  onCommit,
  id,
  autoFocus,
}: {
  value: string;
  onChange: (next: string) => void;
  onCommit?: () => void;
  id?: string;
  autoFocus?: boolean;
}) {
  return (
    <Input
      id={id}
      value={value}
      autoFocus={autoFocus}
      onChange={(e) => onChange(e.target.value)}
      onBlur={() => onCommit?.()}
      onKeyDown={(e) => {
        if (e.key === "Enter" && !e.metaKey && !e.ctrlKey && onCommit) {
          e.preventDefault();
          onCommit();
        }
      }}
      placeholder="optional, e.g. Client review"
      maxLength={200}
      className="h-8 text-[13px]"
    />
  );
}
