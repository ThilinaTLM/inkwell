// Keyboard shortcut sheet (wireframe screen 11), opened with `?`.
// Generated from the command registry (effective, user-overridden
// bindings), searchable, links to Settings → Shortcuts.

import { Search01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { fuzzyMatch } from "@/lib/commands/fuzzy";
import { formatBinding } from "@/lib/commands/keymap";
import {
  COMMAND_GROUP_LABELS,
  type CommandGroup,
  commandLabel,
  getEffectiveKeys,
  isEditorOnly,
  useCommandContext,
  useCommandList,
} from "@/lib/commands/registry";
import { KeyCombo } from "./Kbd";
import { closeShortcutSheet, useShellState } from "./shellStore";

const GROUP_ORDER: CommandGroup[] = ["navigate", "select", "file", "organise", "view", "app"];

export function ShortcutSheet() {
  const open = useShellState((s) => s.sheetOpen);
  return (
    <Dialog open={open} onOpenChange={(o) => !o && closeShortcutSheet()}>
      <DialogContent className="top-[60px] max-h-[calc(100dvh-100px)] translate-y-0 gap-0 overflow-hidden p-0 sm:max-w-[920px]">
        {open ? <SheetBody /> : null}
      </DialogContent>
    </Dialog>
  );
}

function SheetBody() {
  const commands = useCommandList();
  const ctx = useCommandContext({ selection: [{ type: "file", id: "_" }] });
  const editor = ctx.scope === "editor";
  const [q, setQ] = useState("");

  const groups = useMemo(() => {
    const by = new Map<CommandGroup, Array<{ id: string; label: string; keys: string[] }>>();
    for (const c of commands) {
      // Editor: only the editor's own bindings. App: app-scoped commands.
      if (editor ? !isEditorOnly(c) : !(c.scopes ?? ["app"]).includes("app")) continue;
      const keys = getEffectiveKeys(c.id);
      if (!keys.length) continue;
      let label: string;
      try {
        label = commandLabel(c, ctx);
      } catch {
        label = c.id;
      }
      if (q && !fuzzyMatch(q, `${label} ${keys.map((k) => formatBinding(k)).join(" ")}`)) continue;
      const arr = by.get(c.group) ?? [];
      arr.push({ id: c.id, label, keys });
      by.set(c.group, arr);
    }
    return GROUP_ORDER.filter((g) => by.get(g)?.length).map((g) => ({
      group: g,
      rows: by.get(g) ?? [],
    }));
  }, [commands, ctx, q, editor]);

  return (
    <div className="flex min-h-0 flex-col">
      <div className="flex flex-wrap items-center gap-3 border-b border-border px-5 py-3.5 pr-12">
        <DialogTitle className="font-brand text-2xl font-normal">Keyboard shortcuts</DialogTitle>
        <span className="flex-1" />
        <label className="flex h-7 w-60 items-center gap-1.5 rounded-md border border-border bg-card px-2 text-muted-foreground">
          <HugeiconsIcon icon={Search01Icon} strokeWidth={2} className="size-3.5" />
          <input
            // biome-ignore lint/a11y/noAutofocus: search takes focus when the sheet opens
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search shortcuts…"
            aria-label="Search shortcuts"
            className="h-full min-w-0 flex-1 bg-transparent text-xs text-foreground outline-none"
          />
        </label>
        <Link
          to="/settings/shortcuts"
          onClick={closeShortcutSheet}
          className="text-xs text-primary hover:underline"
        >
          Customize in Settings →
        </Link>
      </div>
      <div className="grid min-h-0 grid-cols-1 gap-x-6 gap-y-5 overflow-y-auto px-5 py-4 text-[12.5px] sm:grid-cols-2 lg:grid-cols-3">
        {groups.map(({ group, rows }) => (
          <section key={group}>
            <h3 className="mb-1.5 text-[10.5px] tracking-[0.08em] text-primary uppercase">
              {COMMAND_GROUP_LABELS[group]}
            </h3>
            {rows.map((r) => (
              <div
                key={r.id}
                className="flex items-center justify-between gap-2.5 border-b border-border/50 py-1"
              >
                <span className="truncate text-muted-foreground">{r.label}</span>
                <span className="flex shrink-0 items-center gap-1.5">
                  {r.keys.map((k, i) => (
                    <span key={k} className="flex items-center gap-1.5">
                      {i > 0 ? <span className="text-muted-foreground/60">/</span> : null}
                      <KeyCombo binding={k} />
                    </span>
                  ))}
                </span>
              </div>
            ))}
          </section>
        ))}
        {groups.length === 0 ? (
          <div className="col-span-full py-8 text-center text-sm text-muted-foreground">
            No shortcuts match “{q}”.
          </div>
        ) : null}
      </div>
      <div className="border-t border-border px-5 py-2.5 text-[11.5px] text-muted-foreground">
        {editor
          ? "In editors only these chords are global; the canvas / document keeps its own shortcuts. Everything else is in the command palette."
          : "Single-key shortcuts only fire when focus isn't in a text field. Arrow keys, ⇧-click and rubber-band selection work in every view."}
      </div>
    </div>
  );
}
