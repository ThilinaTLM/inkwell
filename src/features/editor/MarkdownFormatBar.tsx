// Compact formatting toolbar for the Write (WYSIWYG) mode. Rendered in the
// editor header's sub-bar; actions run Milkdown commands through the Crepe
// handle and highlight the formats at the caret.

import {
  ArrowDown01Icon,
  CheckListIcon,
  CodeIcon,
  CodeSquareIcon,
  LeftToRightListBulletIcon,
  LeftToRightListNumberIcon,
  Link01Icon,
  MinusSignIcon,
  MoreHorizontalIcon,
  QuoteDownIcon,
  Table01Icon,
  TextBoldIcon,
  TextItalicIcon,
  TextStrikethroughIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useCallback, useEffect, useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type { CrepeHandle } from "./markdown/CrepeEditor";
import type { FormatAction, FormatState } from "./markdown/formatCommands";

interface Tool {
  action: FormatAction;
  label: string;
  icon: typeof TextBoldIcon;
  keys?: string;
}

const isMac = typeof navigator !== "undefined" && /mac/i.test(navigator.platform);
const MOD = isMac ? "⌘" : "Ctrl+";

const INLINE: Tool[] = [
  { action: "bold", label: "Bold", icon: TextBoldIcon, keys: `${MOD}B` },
  { action: "italic", label: "Italic", icon: TextItalicIcon, keys: `${MOD}I` },
  { action: "strike", label: "Strikethrough", icon: TextStrikethroughIcon },
  { action: "code", label: "Inline code", icon: CodeIcon, keys: `${MOD}E` },
  { action: "link", label: "Link", icon: Link01Icon },
];
const LISTS: Tool[] = [
  { action: "bullet", label: "Bulleted list", icon: LeftToRightListBulletIcon },
  { action: "ordered", label: "Numbered list", icon: LeftToRightListNumberIcon },
  { action: "task", label: "Task list", icon: CheckListIcon },
];
const BLOCKS: Tool[] = [
  { action: "quote", label: "Quote", icon: QuoteDownIcon },
  { action: "codeblock", label: "Code block", icon: CodeSquareIcon },
  { action: "table", label: "Table", icon: Table01Icon },
  { action: "divider", label: "Divider", icon: MinusSignIcon },
];

const HEADINGS: ReadonlyArray<{ action: FormatAction; level: number; label: string }> = [
  { action: "paragraph", level: 0, label: "Text" },
  { action: "h1", level: 1, label: "Heading 1" },
  { action: "h2", level: 2, label: "Heading 2" },
  { action: "h3", level: 3, label: "Heading 3" },
  { action: "h4", level: 4, label: "Heading 4" },
  { action: "h5", level: 5, label: "Heading 5" },
  { action: "h6", level: 6, label: "Heading 6" },
];

const EMPTY: FormatState = { heading: 0, active: {} };

const btn =
  "inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40 aria-pressed:bg-accent-soft aria-pressed:text-accent-text";

function Sep() {
  return <span aria-hidden className="mx-1 h-4 w-px shrink-0 bg-border" />;
}

export function MarkdownFormatBar({ handle }: { handle: CrepeHandle | null }) {
  const [state, setState] = useState<FormatState>(EMPTY);

  useEffect(() => {
    if (!handle) {
      setState(EMPTY);
      return;
    }
    const sync = () => {
      try {
        setState(handle.getFormatState());
      } catch {
        setState(EMPTY);
      }
    };
    sync();
    return handle.subscribe(sync);
  }, [handle]);

  const run = useCallback(
    (action: FormatAction, afterMenu = false) => {
      if (!handle) return;
      handle.format(action);
      // Menus hand focus back to their trigger when they close.
      if (afterMenu) window.setTimeout(() => handle.focus(), 80);
    },
    [handle],
  );

  const tool = (t: Tool, extra?: string) => (
    <button
      key={t.action}
      type="button"
      aria-label={t.label}
      aria-pressed={Boolean(state.active[t.action])}
      title={t.keys ? `${t.label} (${t.keys})` : t.label}
      disabled={!handle}
      data-testid={`markdown-format-${t.action}`}
      // Keep the editor's focus and selection while clicking.
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => run(t.action)}
      className={cn(btn, "disabled:opacity-40", extra)}
    >
      <HugeiconsIcon icon={t.icon} strokeWidth={1.8} className="size-4" />
    </button>
  );

  const current = HEADINGS.find((h) => h.level === state.heading) ?? HEADINGS[0];
  // On narrow screens only the essentials stay inline; the rest move to "More".
  const overflow: Tool[] = [INLINE[2], INLINE[3], LISTS[1], LISTS[2], ...BLOCKS];

  return (
    <div
      role="toolbar"
      aria-label="Formatting"
      data-testid="markdown-format-bar"
      className="flex w-full items-center gap-0.5 py-1"
    >
      <DropdownMenu>
        <DropdownMenuTrigger
          disabled={!handle}
          aria-label={`Text style: ${current.label}`}
          title="Text style"
          data-testid="markdown-format-heading"
          className="inline-flex h-7 min-w-[5.25rem] shrink-0 items-center justify-between gap-1 rounded-md px-2 text-xs font-medium text-foreground outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/40 aria-expanded:bg-accent disabled:opacity-40"
        >
          {current.label}
          <HugeiconsIcon
            icon={ArrowDown01Icon}
            strokeWidth={2}
            className="size-3 text-muted-foreground"
          />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-40 min-w-40">
          {HEADINGS.map((h) => (
            <DropdownMenuItem
              key={h.action}
              onClick={() => run(h.action, true)}
              className={cn(
                "min-h-7 py-1 text-[13px]",
                h.level === state.heading && "bg-accent-soft text-accent-text",
              )}
            >
              {h.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <Sep />
      {INLINE.map((t) =>
        tool(t, t.action === "strike" || t.action === "code" ? "max-sm:hidden" : undefined),
      )}
      <Sep />
      {LISTS.map((t) => tool(t, t.action !== "bullet" ? "max-sm:hidden" : undefined))}
      <span aria-hidden className="mx-1 h-4 w-px shrink-0 bg-border max-sm:hidden" />
      {BLOCKS.map((t) => tool(t, "max-sm:hidden"))}

      <DropdownMenu>
        <DropdownMenuTrigger
          disabled={!handle}
          aria-label="More formatting"
          title="More formatting"
          className={cn(btn, "ml-auto sm:hidden aria-expanded:bg-accent")}
        >
          <HugeiconsIcon icon={MoreHorizontalIcon} strokeWidth={1.8} className="size-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44 min-w-44">
          {overflow.map((t) => (
            <DropdownMenuItem
              key={t.action}
              onClick={() => run(t.action, true)}
              className="min-h-7 py-1 text-[13px]"
            >
              <HugeiconsIcon icon={t.icon} strokeWidth={1.8} />
              {t.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
