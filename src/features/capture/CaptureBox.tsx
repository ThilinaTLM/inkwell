// Capture box: type a thought + Enter → Markdown note in the destination
// (Inbox by default) with an Open / Undo toast. Shift+Enter = newline.
// Quick buttons create a blank note / whiteboard / diagram, or upload.
//
//   <CaptureBox folderId={null} />                         Home / Inbox (inline row)
//   <CaptureBox folderId={id} variant="dialog" autoFocus onDone={close} />

import {
  FlowIcon,
  Note01Icon,
  QuillWrite01Icon,
  Upload01Icon,
  WhiteboardIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useQueryClient } from "@tanstack/react-query";
import {
  type KeyboardEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { useNavigate } from "react-router-dom";
import { Kbd } from "@/components/shell/Kbd";
import { useFolders } from "@/data/folders";
import { openUploadPicker } from "@/features/upload";
import { cn } from "@/lib/utils";
import { type CaptureCtx, type CaptureKind, captureText, createBlank } from "./captureActions";

type QuickChoice = {
  id: "note" | "board" | "diagram" | "upload";
  label: string;
  icon: typeof Note01Icon;
};

const CHOICES: QuickChoice[] = [
  { id: "note", label: "Note", icon: Note01Icon },
  { id: "board", label: "Whiteboard", icon: WhiteboardIcon },
  { id: "diagram", label: "Diagram", icon: FlowIcon },
  { id: "upload", label: "Upload", icon: Upload01Icon },
];

export interface CaptureBoxProps {
  /** Destination folder; `null` = Inbox. */
  folderId: string | null;
  variant?: "page" | "dialog";
  autoFocus?: boolean;
  /** Include the Diagram quick choice (always shown in the dialog). */
  diagram?: boolean;
  /** Called after anything was created / the upload picker was opened. */
  onDone?: () => void;
  className?: string;
}

export function CaptureBox({
  folderId,
  variant = "page",
  autoFocus,
  diagram = variant === "dialog",
  onDone,
  className,
}: CaptureBoxProps) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const folders = useFolders();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [focused, setFocused] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);
  const dialog = variant === "dialog";

  const ctx = useCallback(
    (): CaptureCtx => ({
      qc,
      navigate,
      folderId,
      folderName: folderId ? (folders.data?.find((f) => f.id === folderId)?.name ?? null) : null,
    }),
    [qc, navigate, folderId, folders.data],
  );

  useEffect(() => {
    if (autoFocus) ref.current?.focus();
  }, [autoFocus]);

  // Auto-grow up to ~6 lines.
  // biome-ignore lint/correctness/useExhaustiveDependencies: resize whenever the text changes
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 168)}px`;
  }, [text]);

  async function submit() {
    if (busy || !text.trim()) return;
    setBusy(true);
    const m = await captureText(ctx(), text);
    setBusy(false);
    if (m) {
      setText("");
      onDone?.();
      if (!dialog) ref.current?.focus();
    }
  }

  async function choose(id: QuickChoice["id"]) {
    if (id === "upload") {
      openUploadPicker({ folderId });
      onDone?.();
      return;
    }
    if (busy) return;
    const kind: CaptureKind = id === "note" ? "notes" : id === "board" ? "excalidraw" : "drawio";
    setBusy(true);
    const m = await createBlank(ctx(), kind);
    setBusy(false);
    if (m) onDone?.();
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void submit();
    } else if (e.key === "Escape" && !dialog) {
      ref.current?.blur();
    }
  }

  const choices = CHOICES.filter((c) => diagram || c.id !== "diagram");

  return (
    <div
      className={cn(
        "rounded-2xl border border-border bg-card shadow-card transition-[border-color,box-shadow] focus-within:border-primary focus-within:ring-4 focus-within:ring-accent-soft",
        dialog
          ? "flex flex-col"
          : "flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-2.5 sm:pr-2",
        className,
      )}
    >
      <div className="flex min-w-0 flex-1 items-start gap-3 py-2 pr-2 pl-4 sm:py-1.5">
        <HugeiconsIcon
          icon={QuillWrite01Icon}
          strokeWidth={1.8}
          className="mt-[15px] size-[18px] shrink-0 text-primary"
        />
        <textarea
          ref={ref}
          rows={1}
          value={text}
          readOnly={busy}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder="Capture a thought…"
          aria-label="Capture a thought"
          className="max-h-[168px] min-h-[52px] flex-1 resize-none bg-transparent py-[13px] font-display text-[17px] leading-relaxed text-foreground outline-none placeholder:italic placeholder:text-faint"
        />
        {!dialog && !text && !focused ? (
          <Kbd className="mt-4 hidden shrink-0 sm:inline-flex">N</Kbd>
        ) : null}
        {text.trim() ? (
          <span className="mt-4 hidden shrink-0 text-[11.5px] text-faint sm:inline">
            <Kbd>↵</Kbd> save · <Kbd>⇧↵</Kbd> new line
          </span>
        ) : null}
      </div>
      <div
        className={cn(
          "flex flex-wrap items-center gap-1.5 px-3 pb-2.5 sm:pb-0",
          dialog && "border-t border-border px-3 py-2.5",
        )}
      >
        {dialog ? <span className="mr-1 text-xs text-muted-foreground">Or start with</span> : null}
        {choices.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => void choose(c.id)}
            className="inline-flex h-8 items-center gap-1.5 rounded-[9px] border border-border bg-surface-2 px-2.5 text-[13px] font-medium text-foreground transition-colors outline-none hover:border-input hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/50"
          >
            <HugeiconsIcon
              icon={c.icon}
              strokeWidth={1.8}
              className="size-4 text-muted-foreground"
            />
            {c.label}
          </button>
        ))}
      </div>
    </div>
  );
}
