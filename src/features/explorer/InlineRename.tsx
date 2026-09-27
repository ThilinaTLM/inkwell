// Inline rename field (F2 / slow second click on the name).
//   ↵ commits · Esc cancels · Tab commits and renames the next item
//   (⇧Tab the previous one) · blur commits.

import { useEffect, useRef } from "react";
import { itemActions } from "@/features/actions/useItemActions";
import type { ItemRef } from "@/lib/api/client";
import { cn } from "@/lib/utils";

export function InlineRename({
  itemRef,
  name,
  className,
  onDone,
}: {
  itemRef: ItemRef;
  name: string;
  className?: string;
  /** `advance` = +1 / -1 when Tab / ⇧Tab ended the rename. */
  onDone: (advance: 0 | 1 | -1) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const done = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    // Select the name without a trailing ".ext"-like suffix.
    const dot = name.lastIndexOf(".");
    el.setSelectionRange(0, dot > 0 && name.length - dot <= 6 ? dot : name.length);
  }, [name]);

  const finish = (commit: boolean, advance: 0 | 1 | -1) => {
    if (done.current) return;
    done.current = true;
    const next = ref.current?.value.trim() ?? "";
    if (commit && next && next !== name) void itemActions.rename(itemRef, next);
    onDone(advance);
  };

  return (
    <input
      ref={ref}
      defaultValue={name}
      aria-label="New name"
      data-inline-rename=""
      maxLength={200}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      onDragStart={(e) => e.preventDefault()}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Enter") {
          e.preventDefault();
          finish(true, 0);
        } else if (e.key === "Escape") {
          e.preventDefault();
          finish(false, 0);
        } else if (e.key === "Tab") {
          e.preventDefault();
          finish(true, e.shiftKey ? -1 : 1);
        }
      }}
      onBlur={() => finish(true, 0)}
      className={cn(
        "h-6 w-full min-w-0 rounded-[5px] border-[1.5px] border-primary bg-card px-1.5 text-[12.5px] font-semibold text-foreground outline-none",
        className,
      )}
    />
  );
}
