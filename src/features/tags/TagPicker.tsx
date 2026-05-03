// Inline tag editor: chips with remove + an autocomplete input. The
// autocomplete pulls from the caller's `suggestions` list (typically
// loaded once via `tags.list()` and passed in).
//
// Tag normalization mirrors the worker: trim + lowercase; max 50 chars;
// max 20 tags. The component does the cosmetic dedupe + length cap so
// callers don't have to.

import { Cancel01Icon, HashtagIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { type KeyboardEvent, useMemo, useRef, useState } from "react";

import { cn } from "@/lib/utils";

export interface TagPickerProps {
  value: string[];
  onChange: (next: string[]) => void;
  /** Optional list of existing tags to autocomplete against. */
  suggestions?: string[];
  placeholder?: string;
  className?: string;
  /** Render compact (smaller chips) for use inside dialogs. */
  size?: "sm" | "md";
  disabled?: boolean;
}

const MAX_TAGS = 20;
const MAX_LEN = 50;

export function TagPicker({
  value,
  onChange,
  suggestions = [],
  placeholder = "Add a tag…",
  className,
  size = "md",
  disabled,
}: TagPickerProps) {
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const normalized = useMemo(
    () => value.map((v) => v.trim().toLowerCase()).filter(Boolean),
    [value],
  );

  const filteredSuggestions = useMemo(() => {
    const q = draft.trim().toLowerCase();
    if (!q) return [];
    const used = new Set(normalized);
    return suggestions.filter((s) => !used.has(s) && s.includes(q)).slice(0, 6);
  }, [draft, suggestions, normalized]);

  function add(raw: string) {
    const n = raw.trim().toLowerCase().slice(0, MAX_LEN);
    if (!n) return;
    if (normalized.includes(n)) {
      setDraft("");
      return;
    }
    if (normalized.length >= MAX_TAGS) return;
    onChange([...normalized, n]);
    setDraft("");
  }

  function remove(tag: string) {
    onChange(normalized.filter((t) => t !== tag));
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      add(draft);
    } else if (e.key === "Backspace" && !draft && normalized.length > 0) {
      // Delete last chip on backspace in empty input.
      onChange(normalized.slice(0, -1));
    }
  }

  const chipCls =
    size === "sm" ? "h-5 gap-1 px-1.5 text-[0.625rem]" : "h-6 gap-1 px-2 text-[0.6875rem]";

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      {/* The wrapper is a <label> so clicks on chip whitespace forward focus
          to the contained <input> natively, with no JS or a11y workaround. */}
      <label
        className={cn(
          "flex flex-wrap items-center gap-1 rounded-md border border-input bg-background px-2 py-1.5 transition-colors focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/20",
          disabled && "pointer-events-none opacity-60",
        )}
      >
        {normalized.map((tag) => (
          <span
            key={tag}
            className={cn(
              "inline-flex items-center rounded-full bg-folder-soft text-foreground",
              chipCls,
            )}
          >
            <HugeiconsIcon icon={HashtagIcon} strokeWidth={2} className="size-2.5 opacity-70" />
            <span className="truncate max-w-[10rem]">{tag}</span>
            <button
              type="button"
              aria-label={`Remove ${tag}`}
              onClick={(e) => {
                e.stopPropagation();
                remove(tag);
              }}
              className="ml-0.5 rounded-full p-0.5 text-muted-foreground hover:bg-border hover:text-foreground"
            >
              <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} className="size-2.5" />
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          onBlur={() => {
            if (draft.trim()) add(draft);
          }}
          placeholder={normalized.length === 0 ? placeholder : ""}
          disabled={disabled || normalized.length >= MAX_TAGS}
          className="min-w-[6rem] flex-1 bg-transparent px-1 py-0.5 font-sans text-sm text-foreground outline-none placeholder:text-muted-foreground/70"
        />
      </label>
      {filteredSuggestions.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {filteredSuggestions.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => add(s)}
              className={cn(
                "inline-flex items-center rounded-full border border-input bg-card text-muted-foreground hover:border-foreground/30 hover:text-foreground hover:bg-accent",
                chipCls,
              )}
            >
              <HugeiconsIcon icon={HashtagIcon} strokeWidth={2} className="size-2.5 opacity-60" />
              <span className="truncate max-w-[10rem]">{s}</span>
            </button>
          ))}
        </div>
      ) : null}
      <div className="text-xs text-muted-foreground/70">
        Press Enter or comma to add. Up to {MAX_TAGS} tags.
      </div>
    </div>
  );
}
