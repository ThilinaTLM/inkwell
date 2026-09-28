// Settings → Shortcuts: every registered command with its effective
// binding. Click a binding to rebind (captures the next key or a 2-key
// chord like "g h"); a conflicting binding asks before it is assigned.
// Overrides live in localStorage (`inkwell.keymap`) via keymap.ts.

import { Alert02Icon, ArrowTurnBackwardIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Kbd, KeyCombo } from "@/components/shell/Kbd";
import { Button } from "@/components/ui/button";
import {
  eventToCombo,
  findConflicts,
  formatBinding,
  getKeyOverrides,
  resetAllKeyOverrides,
  setKeyOverride,
  useKeyOverridesVersion,
} from "@/lib/commands/keymap";
import {
  COMMAND_GROUP_LABELS,
  type Command,
  type CommandGroup,
  commandLabel,
  getCommand,
  getCommandContext,
  getEffectiveKeys,
  useCommandList,
} from "@/lib/commands/registry";
import { useExplorerPref } from "@/lib/explorerPrefs";
import { cn } from "@/lib/utils";
import { SettingsGroup, Toggle } from "../controls";
import { canStartChord, comboToBinding, conflictsFor } from "../keyCapture";

const GROUP_ORDER: CommandGroup[] = ["navigate", "select", "file", "organise", "view", "app"];

function labelOf(id: string): string {
  const c = getCommand(id);
  return c ? commandLabel(c, getCommandContext({ selection: [], focused: null })) : id;
}

function effectiveMap(commands: Command[]): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const c of commands) out[c.id] = getEffectiveKeys(c.id);
  return out;
}

export function ShortcutsSection({ query }: { query: string }) {
  const commands = useCommandList();
  useKeyOverridesVersion();
  const overrides = getKeyOverrides();
  const [singleKey, setSingleKey] = useExplorerPref("singleKeyShortcuts");
  const [capturing, setCapturing] = useState<string | null>(null);
  const [chordFirst, setChordFirst] = useState<string | null>(null);
  const [pending, setPending] = useState<{
    id: string;
    binding: string;
    conflicts: string[];
  } | null>(null);
  const timer = useRef<number | undefined>(undefined);

  const assign = (id: string, binding: string) => {
    setKeyOverride(id, [binding]);
    toast.success(`${labelOf(id)} → ${formatBinding(binding)}`);
  };

  // Key capture runs in the window capture phase so the global hotkey
  // dispatcher never sees the keys being recorded.
  // biome-ignore lint/correctness/useExhaustiveDependencies: assign only calls toast + keymap setters
  useEffect(() => {
    if (!capturing) return;
    const id = capturing;
    const finish = (binding: string) => {
      window.clearTimeout(timer.current);
      setCapturing(null);
      setChordFirst(null);
      const clashes = conflictsFor(id, binding, effectiveMap(commands));
      if (clashes.length) setPending({ id, binding, conflicts: clashes });
      else assign(id, binding);
    };
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopImmediatePropagation();
      if (e.key === "Escape" && !e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey) {
        window.clearTimeout(timer.current);
        setCapturing(null);
        setChordFirst(null);
        return;
      }
      const b = comboToBinding(eventToCombo(e));
      if (!b) return;
      if (chordFirst) {
        finish(`${chordFirst} ${b}`);
        return;
      }
      if (canStartChord(b)) {
        setChordFirst(b);
        timer.current = window.setTimeout(() => finish(b), 1200);
        return;
      }
      finish(b);
    };
    const onDown = (e: MouseEvent) => {
      if (!(e.target instanceof Element) || !e.target.closest(`[data-capture="${id}"]`)) {
        window.clearTimeout(timer.current);
        setCapturing(null);
        setChordFirst(null);
      }
    };
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("mousedown", onDown, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("mousedown", onDown, true);
    };
  }, [capturing, chordFirst, commands]);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: recompute when key overrides change
  const groups = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const ctx = getCommandContext({ selection: [], focused: null });
    const by = new Map<CommandGroup, Command[]>();
    for (const c of commands) {
      const label = commandLabel(c, ctx);
      const keys = getEffectiveKeys(c.id)
        .map((k) => formatBinding(k))
        .join(" ");
      if (needle && !`${label} ${c.id} ${keys}`.toLowerCase().includes(needle)) continue;
      const list = by.get(c.group) ?? [];
      list.push(c);
      by.set(c.group, list);
    }
    return GROUP_ORDER.filter((g) => by.has(g)).map((g) => ({
      group: g,
      commands: (by.get(g) ?? []).sort((a, b) =>
        commandLabel(a, ctx).localeCompare(commandLabel(b, ctx)),
      ),
    }));
  }, [commands, query, overrides]);

  // Only surface conflicts the user introduced; some defaults share a key
  // on purpose (Delete = trash in folders, delete forever in Trash).
  const userConflicts = findConflicts().filter((c) => c.ids.some((id) => overrides[id]));
  const overrideCount = Object.keys(overrides).length;

  return (
    <>
      <SettingsGroup
        title="Keyboard"
        description="Shortcuts never fire while typing in a field. ⌘ is Ctrl on Windows and Linux."
        action={
          <Button
            variant="outline"
            size="sm"
            disabled={!overrideCount}
            onClick={() => {
              resetAllKeyOverrides();
              toast.success("All shortcuts reset to defaults");
            }}
          >
            Reset all{overrideCount ? ` (${overrideCount})` : ""}
          </Button>
        }
      >
        <div className="flex items-center justify-between gap-4 py-1">
          <div>
            <div className="text-[12.5px] font-semibold">Single-key shortcuts</div>
            <div className="text-xs text-muted-foreground">
              Letters, digits and chords like <Kbd>G</Kbd> <Kbd>H</Kbd>. Disable if they conflict
              with assistive tech.
            </div>
          </div>
          <Toggle label="Single-key shortcuts" checked={singleKey} onChange={setSingleKey} />
        </div>
      </SettingsGroup>

      {pending ? (
        <div
          role="alert"
          className="mb-3.5 flex flex-wrap items-center gap-2 rounded-xl border border-chart-3/60 bg-chart-3/10 px-4 py-3 text-[13px]"
        >
          <HugeiconsIcon icon={Alert02Icon} strokeWidth={2} className="size-4 text-chart-3" />
          <span className="min-w-0 flex-1">
            <KeyCombo binding={pending.binding} /> is already used by{" "}
            <b>{pending.conflicts.map(labelOf).join(", ")}</b>. Commands that apply on different
            pages can share a key.
          </span>
          <Button
            size="sm"
            onClick={() => {
              assign(pending.id, pending.binding);
              setPending(null);
            }}
          >
            Assign anyway
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setPending(null)}>
            Cancel
          </Button>
        </div>
      ) : null}

      {userConflicts.length ? (
        <div className="mb-3.5 rounded-xl border border-chart-3/60 bg-chart-3/10 px-4 py-3 text-[13px]">
          <div className="mb-1 flex items-center gap-2 font-semibold">
            <HugeiconsIcon icon={Alert02Icon} strokeWidth={2} className="size-4 text-chart-3" />
            Conflicting shortcuts
          </div>
          <ul className="flex flex-col gap-1 text-xs text-muted-foreground">
            {userConflicts.map((c) => (
              <li key={`${c.binding}:${c.ids.join()}`} className="flex items-center gap-2">
                <KeyCombo binding={c.binding} /> {c.ids.map(labelOf).join(" · ")}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {groups.length === 0 ? (
        <p className="py-10 text-center font-hand text-xl text-muted-foreground">
          No commands match.
        </p>
      ) : null}

      {groups.map(({ group, commands: list }) => (
        <SettingsGroup key={group} title={COMMAND_GROUP_LABELS[group]}>
          {list.map((c) => {
            const keys = getEffectiveKeys(c.id);
            const overridden = !!overrides[c.id];
            const isCapturing = capturing === c.id;
            const label = labelOf(c.id);
            return (
              <div
                key={c.id}
                data-command-row={c.id}
                className="grid grid-cols-[1fr_auto] items-center gap-3 border-t border-border py-1.5 first:border-t-0 sm:grid-cols-[1fr_220px_auto]"
              >
                <div className="min-w-0">
                  <div className="truncate text-[13px]">{label}</div>
                  <div className="truncate font-mono text-[10.5px] text-muted-foreground">
                    {c.id}
                  </div>
                </div>
                <button
                  type="button"
                  data-capture={c.id}
                  aria-label={`Change shortcut for ${label}`}
                  onClick={() => {
                    setPending(null);
                    setChordFirst(null);
                    setCapturing(isCapturing ? null : c.id);
                  }}
                  className={cn(
                    "flex h-7 min-w-[120px] items-center gap-1.5 rounded-md border border-dashed border-transparent px-2 text-left outline-none hover:border-border focus-visible:ring-2 focus-visible:ring-ring/40",
                    isCapturing && "border-primary bg-accent/50",
                  )}
                >
                  {isCapturing ? (
                    <span className="text-xs text-accent-foreground">
                      {chordFirst ? (
                        <>
                          <KeyCombo binding={chordFirst} /> then…
                        </>
                      ) : (
                        "Press keys… (Esc cancels)"
                      )}
                    </span>
                  ) : keys.length ? (
                    keys.map((k, i) => (
                      <span key={k} className="flex items-center gap-1">
                        {i > 0 ? (
                          <span className="text-[10px] text-muted-foreground">or</span>
                        ) : null}
                        <KeyCombo binding={k} />
                      </span>
                    ))
                  ) : (
                    <span className="text-xs text-muted-foreground">
                      {overridden ? "Unbound" : "Add shortcut"}
                    </span>
                  )}
                </button>
                <div className="col-span-2 flex items-center justify-end gap-1 sm:col-span-1">
                  {isCapturing && keys.length ? (
                    <Button
                      variant="ghost"
                      size="xs"
                      onMouseDown={(e) => e.preventDefault()}
                      data-capture={c.id}
                      onClick={() => {
                        setKeyOverride(c.id, []);
                        setCapturing(null);
                      }}
                    >
                      Unbind
                    </Button>
                  ) : null}
                  {overridden ? (
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Reset ${label} to default`}
                      title={`Reset to default${c.keys?.length ? ` (${c.keys.map((k) => formatBinding(k)).join(", ")})` : ""}`}
                      onClick={() => setKeyOverride(c.id, null)}
                    >
                      <HugeiconsIcon icon={ArrowTurnBackwardIcon} strokeWidth={2} />
                    </Button>
                  ) : (
                    <span className="size-7" />
                  )}
                </div>
              </div>
            );
          })}
        </SettingsGroup>
      ))}
    </>
  );
}
