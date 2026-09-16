// CommandPalette — ⌘K / Ctrl-K quick switcher.
//
// Three result groups, filtered by one query:
//   Actions  create a file of any kind, new folder, jump to a section,
//            toggle the theme
//   Files    every file the account owns (client-side substring match on
//            name; the list is already cached by `useAllFiles`)
//   Folders  every folder, matched on name
//
// Base UI ships no command primitive, so this is a plain dialog with a
// roving `activeIndex` over a flat list of rows: ↑/↓ move, Enter runs,
// Esc closes. Keeping it flat (instead of per-group focus) is what makes
// arrow navigation across group boundaries trivial.

import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import {
  ArrowRight01Icon,
  DashboardSquare02Icon,
  File01Icon,
  FolderAddIcon,
  FolderLibraryIcon,
  Link04Icon,
  Search01Icon,
  Settings02Icon,
  Sun03Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FileKindGlyph } from "@/components/file-kinds/file-kind-icons";
import { Dialog, DialogOverlay, DialogPortal } from "@/components/ui/dialog";
import { useAllFiles } from "@/data/files";
import { useFolders } from "@/data/folders";
import { useItemActions } from "@/features/explorer/ExplorerActionsProvider";
import { FILE_KIND_LIST } from "@/lib/file-kinds";
import { useTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";

interface Row {
  id: string;
  group: string;
  label: string;
  hint?: string;
  icon: ReactNode;
  run: () => void;
}

export function CommandPalette({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const navigate = useNavigate();
  const actions = useItemActions();
  const theme = useTheme();
  const files = useAllFiles();
  const folders = useFolders();
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      setQ("");
      setActive(0);
    }
  }, [open]);

  const rows = useMemo<Row[]>(() => {
    const term = q.trim().toLowerCase();
    const match = (s: string) => !term || s.toLowerCase().includes(term);
    const out: Row[] = [];

    for (const k of FILE_KIND_LIST) {
      const label = `New ${k.label}`;
      if (match(label))
        out.push({
          id: `new:${k.id}`,
          group: "Actions",
          label,
          icon: <FileKindGlyph kind={k.id} className="size-4" />,
          run: () => actions.createFile(k.id),
        });
    }
    if (match("New folder"))
      out.push({
        id: "new:folder",
        group: "Actions",
        label: "New folder",
        icon: <HugeiconsIcon icon={FolderAddIcon} strokeWidth={1.7} className="size-4" />,
        run: () => actions.createFolderIn(actions.currentFolderId),
      });

    const jumps: Array<[string, string, unknown]> = [
      ["Go to Home", "/", DashboardSquare02Icon],
      ["Go to All files", "/files", File01Icon],
      ["Go to Folders", "/folders", FolderLibraryIcon],
      ["Go to Shared links", "/shares", Link04Icon],
      ["Go to Settings", "/settings", Settings02Icon],
    ];
    for (const [label, to, icon] of jumps) {
      if (!match(label)) continue;
      out.push({
        id: `go:${to}`,
        group: "Actions",
        label,
        // biome-ignore lint/suspicious/noExplicitAny: icon shape comes from @hugeicons/core-free-icons
        icon: <HugeiconsIcon icon={icon as any} strokeWidth={1.7} className="size-4" />,
        run: () => navigate(to),
      });
    }
    if (match("Toggle theme"))
      out.push({
        id: "theme",
        group: "Actions",
        label: "Toggle theme",
        hint: theme.mode,
        icon: <HugeiconsIcon icon={Sun03Icon} strokeWidth={1.7} className="size-4" />,
        run: () => theme.toggle(),
      });

    for (const f of files.data ?? []) {
      if (!match(f.name)) continue;
      out.push({
        id: `file:${f.id}`,
        group: "Files",
        label: f.name,
        icon: <FileKindGlyph kind={f.kind} className="size-4" />,
        run: () => navigate(`/f/${f.id}`),
      });
      if (out.length > 60) break;
    }

    for (const f of folders.data ?? []) {
      if (!match(f.name)) continue;
      out.push({
        id: `folder:${f.id}`,
        group: "Folders",
        label: f.name,
        icon: <HugeiconsIcon icon={FolderLibraryIcon} strokeWidth={1.7} className="size-4" />,
        run: () => navigate(`/folders/${f.id}`),
      });
      if (out.length > 80) break;
    }

    return out;
  }, [q, files.data, folders.data, actions, navigate, theme]);

  // Clamp the cursor whenever the result set shrinks.
  useEffect(() => {
    setActive((a) => (a >= rows.length ? 0 : a));
  }, [rows.length]);

  function run(index: number) {
    const row = rows[index];
    if (!row) return;
    onOpenChange(false);
    row.run();
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => (rows.length ? (a + 1) % rows.length : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => (rows.length ? (a - 1 + rows.length) % rows.length : 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      run(active);
    }
  }

  // Keep the active row inside the scroll viewport.
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [active]);

  let lastGroup = "";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPortal>
        <DialogOverlay />
        <DialogPrimitive.Popup
          className="fixed left-1/2 top-[12vh] z-50 w-full max-w-[calc(100%-2rem)] -translate-x-1/2 overflow-hidden rounded-lg bg-popover text-popover-foreground ring-1 ring-border shadow-[0_24px_60px_-20px_rgba(0,0,0,0.35)] outline-none sm:max-w-xl data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95"
          onKeyDown={onKeyDown}
        >
          <DialogPrimitive.Title className="sr-only">Command palette</DialogPrimitive.Title>
          <div className="flex items-center gap-2 border-b border-border px-3">
            <HugeiconsIcon
              icon={Search01Icon}
              strokeWidth={1.7}
              className="size-4 shrink-0 text-muted-foreground"
            />
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search files, folders and actions…"
              aria-label="Search files, folders and actions"
              className="h-11 w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
            />
          </div>

          <div ref={listRef} className="max-h-[52vh] overflow-y-auto p-1.5">
            {rows.length === 0 ? (
              <p className="px-3 py-8 text-center text-xs text-muted-foreground">
                No matches for “{q}”.
              </p>
            ) : (
              rows.map((row, i) => {
                const header = row.group !== lastGroup ? row.group : null;
                lastGroup = row.group;
                return (
                  <div key={row.id}>
                    {header ? (
                      <div className="px-2 pb-1 pt-2 text-[0.6875rem] font-medium uppercase tracking-wide text-muted-foreground/70">
                        {header}
                      </div>
                    ) : null}
                    <button
                      type="button"
                      data-index={i}
                      onMouseMove={() => setActive(i)}
                      onClick={() => run(i)}
                      className={cn(
                        "flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-sm outline-none",
                        i === active
                          ? "bg-accent text-accent-foreground"
                          : "text-foreground hover:bg-muted",
                      )}
                    >
                      <span className="grid size-4 shrink-0 place-items-center text-muted-foreground">
                        {row.icon}
                      </span>
                      <span className="min-w-0 flex-1 truncate">{row.label}</span>
                      {row.hint ? (
                        <span className="shrink-0 text-xs text-muted-foreground">{row.hint}</span>
                      ) : null}
                      {i === active ? (
                        <HugeiconsIcon
                          icon={ArrowRight01Icon}
                          strokeWidth={2}
                          className="size-3.5 shrink-0 opacity-60"
                        />
                      ) : null}
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </DialogPrimitive.Popup>
      </DialogPortal>
    </Dialog>
  );
}
