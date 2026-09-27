// Quick kind picker (wireframe screen 09).
//
// Four kind cards (1–4 / Alt+1–4 or Tab / ⇧Tab to cycle) + a name field
// that is focused on open. ↵ creates and opens the editor; ⌘/Ctrl+↵
// creates and stays (batch creation). While the name is still the
// untouched default, pressing 1–4 switches kind instead of typing.
// "Upload / import…" hands off to the upload module's picker.

import { Upload01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useQueryClient } from "@tanstack/react-query";
import { type KeyboardEvent, useEffect, useRef, useState } from "react";
import { Kbd } from "@/components/shell/Kbd";
import { FileKindGlyph } from "@/components/sketch/file-kind-icons";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { findFolderMeta } from "@/features/actions/itemCache";
import { defaultNameForKind, useItemActions } from "@/features/actions/useItemActions";
import { openUploadPicker } from "@/features/upload";
import type { FileKind } from "@/lib/api/client";
import { isMacPlatform } from "@/lib/commands/keymap";
import { cn } from "@/lib/utils";

const KINDS: Array<{ kind: FileKind; label: string }> = [
  { kind: "excalidraw", label: "Excalidraw" },
  { kind: "drawio", label: "Draw.io" },
  { kind: "notes", label: "Notes" },
  { kind: "static-site", label: "Static site" },
];

export function NewFileDialog({
  folderId,
  kind: initialKind,
  onClose,
}: {
  folderId: string | null;
  kind?: FileKind;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const actions = useItemActions();
  const [open, setOpen] = useState(true);
  const [kindIdx, setKindIdx] = useState(() =>
    Math.max(
      0,
      KINDS.findIndex((k) => k.kind === initialKind),
    ),
  );
  const kind = KINDS[kindIdx].kind;
  const [name, setName] = useState(defaultNameForKind(kind));
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const untouched = name === defaultNameForKind(kind);
  const folderName = folderId ? (findFolderMeta(qc, folderId)?.name ?? "folder") : "Home";

  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.select(), 0);
    return () => clearTimeout(t);
  }, []);

  function pick(i: number) {
    const next = (i + KINDS.length) % KINDS.length;
    if (untouched) setName(defaultNameForKind(KINDS[next].kind));
    setKindIdx(next);
    setTimeout(() => inputRef.current?.select(), 0);
  }

  function close() {
    setOpen(false);
    setTimeout(onClose, 150);
  }

  async function create(stay: boolean) {
    if (busy) return;
    setBusy(true);
    const m = await actions.newFile(folderId, kind, { name, open: !stay });
    setBusy(false);
    if (!m) return;
    if (stay) {
      setName(defaultNameForKind(kind));
      setTimeout(() => inputRef.current?.select(), 0);
    } else {
      close();
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLElement>) {
    const digit =
      /^Digit([1-4])$/.exec(e.nativeEvent.code ?? "")?.[1] ??
      (/^[1-4]$/.test(e.key) ? e.key : null);
    if (digit && (e.altKey || (untouched && !e.metaKey && !e.ctrlKey))) {
      e.preventDefault();
      pick(Number(digit) - 1);
      return;
    }
    if (e.key === "Tab" && e.target === inputRef.current) {
      e.preventDefault();
      pick(kindIdx + (e.shiftKey ? -1 : 1));
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      void create(isMacPlatform ? e.metaKey : e.ctrlKey);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent className="gap-3 sm:max-w-[480px]" onKeyDown={onKeyDown}>
        <div className="flex items-baseline gap-2 pr-8">
          <DialogTitle className="font-hand text-2xl font-semibold">New file</DialogTitle>
          <DialogDescription className="truncate">in {folderName}</DialogDescription>
        </div>
        <fieldset className="grid grid-cols-4 gap-2" aria-label="File kind">
          {KINDS.map((k, i) => (
            <button
              key={k.kind}
              type="button"
              aria-pressed={i === kindIdx}
              onClick={() => pick(i)}
              className={cn(
                "flex flex-col items-center gap-1.5 rounded-lg border-[1.5px] px-2 py-2.5 text-xs font-semibold transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
                i === kindIdx
                  ? "border-primary bg-primary/10 text-foreground"
                  : "border-border text-muted-foreground hover:bg-accent/50",
              )}
            >
              <FileKindGlyph kind={k.kind} variant="full" className="size-7" />
              <span>{k.label}</span>
              <Kbd>{i + 1}</Kbd>
            </button>
          ))}
        </fieldset>
        <Input
          ref={inputRef}
          value={name}
          onChange={(e) => setName(e.target.value)}
          aria-label="File name"
          autoFocus
        />
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <span className="text-[11.5px] text-muted-foreground">
            <Kbd>Tab</Kbd> kind · <Kbd>↵</Kbd> create &amp; open ·{" "}
            <Kbd>{isMacPlatform ? "⌘" : "Ctrl"}</Kbd>
            <Kbd>↵</Kbd> create, stay
          </span>
          <span className="flex-1" />
          <Button
            variant="link"
            size="sm"
            className="px-0"
            onClick={() => {
              close();
              openUploadPicker({ folderId });
            }}
          >
            <HugeiconsIcon icon={Upload01Icon} strokeWidth={2} />
            Upload / import…
          </Button>
          <Button size="sm" disabled={busy || !name.trim()} onClick={() => void create(false)}>
            {busy ? "Creating…" : "Create"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
