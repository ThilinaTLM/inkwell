// Keyboard shortcut sheet, opened with `?`.
// App shortcuts are generated from the command registry (default bindings only —
// rebinding was removed); editor shortcuts are a fixed list because the editors
// handle those keys themselves. Searchable.

import { Search01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useMemo, useState } from "react";
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

interface Row {
  id: string;
  label: string;
  keys: string[];
}

/** Keys the editors handle themselves (not in the registry). */
const EDITOR_ROWS: Row[] = [
  { id: "ed.save", label: "Save now", keys: ["mod+s"] },
  { id: "ed.export", label: "Export", keys: ["mod+shift+s"] },
  { id: "ed.rename", label: "Rename file", keys: ["f2"] },
  { id: "ed.back", label: "Back to where you came from", keys: ["mod+["] },
];

export function ShortcutSheet() {
  const open = useShellState((s) => s.sheetOpen);
  return (
    <Dialog open={open} onOpenChange={(o) => !o && closeShortcutSheet()}>
      <DialogContent className="top-[8vh] max-h-[calc(100dvh-8vh-24px)] translate-y-0 gap-0 overflow-hidden rounded-2xl p-0 shadow-pop sm:max-w-[920px]">
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
    const by = new Map<CommandGroup, Row[]>();
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
    const sections = GROUP_ORDER.filter((g) => by.get(g)?.length).map((g) => ({
      key: g as string,
      title: COMMAND_GROUP_LABELS[g],
      rows: by.get(g) ?? [],
    }));
    const edRows = EDITOR_ROWS.filter(
      (r) => !q || fuzzyMatch(q, `${r.label} ${r.keys.map((k) => formatBinding(k)).join(" ")}`),
    );
    if (edRows.length) {
      const section = { key: "editor", title: "In the editor", rows: edRows };
      if (editor) sections.unshift(section);
      else sections.push(section);
    }
    return sections;
  }, [commands, ctx, q, editor]);

  return (
    <div className="flex min-h-0 flex-col">
      <div className="flex flex-wrap items-center gap-3 border-b border-border px-5 py-3.5 pr-12">
        <DialogTitle className="font-display text-xl font-medium">Keyboard shortcuts</DialogTitle>
        <span className="flex-1" />
        <label className="flex h-7 w-60 items-center gap-1.5 rounded-lg border border-input bg-card px-2 text-muted-foreground">
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
      </div>
      <div className="grid min-h-0 grid-cols-1 gap-x-6 gap-y-5 overflow-y-auto px-5 py-4 text-[12.5px] sm:grid-cols-2 lg:grid-cols-3">
        {groups.map(({ key, title, rows }) => (
          <section key={key}>
            <h3 className="mb-1.5 text-[10.5px] font-semibold tracking-[0.08em] text-accent-text uppercase">
              {title}
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
      <div className="border-t border-border bg-surface-2 px-5 py-2.5 text-[11.5px] text-muted-foreground">
        Single-key shortcuts only fire when focus isn't in a text field. Press{" "}
        <KeyCombo binding="mod+k" className="mx-0.5" /> for everything else.
      </div>
    </div>
  );
}
