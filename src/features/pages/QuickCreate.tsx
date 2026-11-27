// Quick-create row for Home and Recents: Note · Whiteboard · Diagram ·
// HTML site · Upload. Each option gets its file-kind glyph so the four
// creatable kinds read as equals. Everything is created in `folderId`
// (default: loose root files) through the same actions as the New menu.
//
//   <QuickCreate />                       tiles (Home)
//   <QuickCreate variant="compact" />     one-line chips (Recents, dialogs)

import { Upload01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { FileKindGlyph } from "@/components/icons/file-kind-icons";
import { itemActions } from "@/features/actions/useItemActions";
import { openUploadPicker } from "@/features/upload";
import type { FileKind } from "@/lib/api/client";
import { cn } from "@/lib/utils";

interface Option {
  id: string;
  label: string;
  hint: string;
  kind?: FileKind;
}

export const QUICK_CREATE_OPTIONS: Option[] = [
  { id: "notes", kind: "notes", label: "Note", hint: "Markdown" },
  { id: "excalidraw", kind: "excalidraw", label: "Whiteboard", hint: "Excalidraw" },
  { id: "drawio", kind: "drawio", label: "Diagram", hint: "draw.io" },
  { id: "static-site", kind: "static-site", label: "HTML site", hint: "Static page" },
  { id: "upload", label: "Upload", hint: "Any file" },
];

function Chip({ option, size }: { option: Option; size: "md" | "sm" }) {
  const box = size === "md" ? "size-10 rounded-[11px]" : "size-6 rounded-[7px]";
  if (option.kind) {
    return (
      <span className={cn("block shrink-0 overflow-hidden ring-1 ring-border/60", box)}>
        <FileKindGlyph kind={option.kind} variant="full" className="size-full" />
      </span>
    );
  }
  return (
    <span
      className={cn(
        "grid shrink-0 place-items-center bg-muted text-muted-foreground ring-1 ring-border/60",
        box,
      )}
    >
      <HugeiconsIcon
        icon={Upload01Icon}
        strokeWidth={1.8}
        className={size === "md" ? "size-[18px]" : "size-3.5"}
      />
    </span>
  );
}

export function QuickCreate({
  folderId = null,
  variant = "tiles",
  onPick,
  className,
}: {
  folderId?: string | null;
  variant?: "tiles" | "compact";
  /** Called after an option is chosen (e.g. to close a dialog). */
  onPick?: () => void;
  className?: string;
}) {
  const run = (o: Option) => {
    onPick?.();
    if (o.kind) void itemActions.newFile(folderId, o.kind);
    else openUploadPicker({ folderId });
  };
  const compact = variant === "compact";
  return (
    <div
      className={cn(
        compact
          ? "flex flex-wrap gap-2"
          : "grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5 [&>:last-child:nth-child(odd)]:max-sm:col-span-2",
        className,
      )}
    >
      {QUICK_CREATE_OPTIONS.map((o) => (
        <button
          key={o.id}
          type="button"
          onClick={() => run(o)}
          className={cn(
            "group/qc flex items-center border border-border bg-card text-left shadow-card outline-none transition-[transform,box-shadow,border-color] hover:border-input focus-visible:ring-2 focus-visible:ring-ring/50 active:translate-y-0",
            compact
              ? "h-9 gap-2 rounded-[10px] pr-3 pl-1.5 text-[13px] font-medium hover:bg-accent/50"
              : "gap-3 rounded-[14px] p-3 hover:-translate-y-0.5 hover:shadow-pop",
          )}
        >
          <Chip option={o} size={compact ? "sm" : "md"} />
          {compact ? (
            <span>{o.label}</span>
          ) : (
            <span className="min-w-0">
              <span className="block truncate text-[14px] font-semibold text-foreground">
                {o.label}
              </span>
              <span className="block truncate text-xs text-muted-foreground">{o.hint}</span>
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
