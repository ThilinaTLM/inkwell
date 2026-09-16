// ShortcutsTab — a read-only reference of every keyboard shortcut the
// dashboard binds.
//
// Kept in one table so the list stays discoverable; the bindings
// themselves live where they are used (`AppShell` for the global ones,
// `AppTopbar` for `/`, `useExplorerHotkeys` for the item ones). When you
// add a binding, add a row here.

import { SectionHeader } from "@/components/layout/PageHeader";
import { Kbd } from "@/components/ui/kbd";

const GROUPS: Array<{ title: string; items: Array<{ keys: string[]; label: string }> }> = [
  {
    title: "Global",
    items: [
      { keys: ["mod", "K"], label: "Open the command palette" },
      { keys: ["/"], label: "Focus search" },
      { keys: ["mod", "\\"], label: "Collapse or expand the sidebar" },
    ],
  },
  {
    title: "Files and folders",
    items: [
      { keys: ["Enter"], label: "Open the focused item" },
      { keys: ["F2"], label: "Rename the focused item" },
      { keys: ["Delete"], label: "Delete the focused item" },
      { keys: ["Tab"], label: "Move focus between items" },
    ],
  },
];

export function ShortcutsTab() {
  return (
    <section className="flex flex-col gap-5 rounded-lg border border-border bg-card p-5">
      <SectionHeader
        title="Keyboard shortcuts"
        description="Shortcuts are ignored while you are typing in a field."
      />
      {GROUPS.map((g) => (
        <div key={g.title} className="flex flex-col gap-2">
          <h3 className="text-[0.6875rem] font-medium uppercase tracking-wide text-muted-foreground/70">
            {g.title}
          </h3>
          <dl className="divide-y divide-border/60 rounded-md border border-border/60">
            {g.items.map((it) => (
              <div key={it.label} className="flex items-center justify-between gap-4 px-3 py-2">
                <dt className="text-xs text-foreground">{it.label}</dt>
                <dd>
                  <Kbd keys={it.keys} />
                </dd>
              </div>
            ))}
          </dl>
        </div>
      ))}
    </section>
  );
}
