// Command palette / search, opened with ⌘K / Ctrl+K or the sidebar search.
//
// Sections: Recent · Projects · Files · Commands (plus Tags / In project
// suggestions while typing a filter).
//
// Filters are typed and become chips once you press space:
//   #tag          files with that tag
//   in:project    only inside that project (or folder)
//   note | board | diagram | site | file   only that kind
// Backspace on an empty input removes the last chip.
//
// ↑/↓ move · ↵ open/run · ⌘/Ctrl+↵ reveal in folder · Tab actions for the
// highlighted item (⇧Tab / Esc back) · ⌘/Ctrl+⇧+↵ new note named after the query.
// ">" as the first character shows commands only.

import { Cancel01Icon, FileAddIcon, HashtagIcon, Search01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import { useQuery } from "@tanstack/react-query";
import { type KeyboardEvent, type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ProjectIcon } from "@/components/project/ProjectIcon";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { useFolders } from "@/data/folders";
import { useTags } from "@/data/tags";
import { folderPathLabel } from "@/features/actions/itemCache";
import { ITEM_MENU_IDS } from "@/features/actions/itemCommands";
import { itemActions } from "@/features/actions/useItemActions";
import { TargetIcon } from "@/features/library/TargetIcon";
import { type FileMeta, type FolderMeta, files, type ItemRef } from "@/lib/api/client";
import { keys } from "@/lib/api/query-keys";
import { fuzzyFilter, highlightSegments } from "@/lib/commands/fuzzy";
import { formatKeys, isMacPlatform } from "@/lib/commands/keymap";
import {
  type Command,
  type CommandContext,
  commandLabel,
  getCommand,
  getEffectiveKeys,
  isCommandAvailable,
  isEditorOnly,
  runCommand,
  useCommandContext,
  useCommandList,
} from "@/lib/commands/registry";
import { relTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Kbd } from "./Kbd";
import { closePalette, useShellState } from "./shellStore";

type Group = "Recent" | "Projects" | "Files" | "Commands" | "Tags" | "In project" | "Actions";

interface Result {
  key: string;
  group: Group;
  label: string;
  positions?: number[];
  sub?: string;
  icon: ReactNode;
  shortcut?: string;
  ref?: ItemRef;
  /** Keeps the palette open (filter suggestions). */
  keepOpen?: boolean;
  run: () => void;
}

// ─── Filter chips ───────────────────────────────────────────────────────

type Chip =
  | { type: "tag"; value: string; label: string }
  | { type: "in"; value: string; label: string }
  | { type: "kind"; value: string; label: string };

const KIND_WORDS: Record<string, { kind: string; label: string }> = {
  note: { kind: "notes", label: "Notes" },
  notes: { kind: "notes", label: "Notes" },
  board: { kind: "excalidraw", label: "Boards" },
  boards: { kind: "excalidraw", label: "Boards" },
  diagram: { kind: "drawio", label: "Diagrams" },
  diagrams: { kind: "drawio", label: "Diagrams" },
  site: { kind: "static-site", label: "Sites" },
  sites: { kind: "static-site", label: "Sites" },
  file: { kind: "file", label: "Files" },
  files: { kind: "file", label: "Files" },
};

function findProject(all: FolderMeta[], needle: string): FolderMeta | undefined {
  const n = needle.toLowerCase();
  const pool = all.filter((f) => f.parentId === null);
  return (
    pool.find((f) => f.name.toLowerCase() === n) ??
    pool.find((f) => f.name.toLowerCase().startsWith(n)) ??
    pool.find((f) => f.name.toLowerCase().includes(n))
  );
}

function tokenToChip(token: string, folders: FolderMeta[], tagNames: string[]): Chip | null {
  const lower = token.toLowerCase();
  if (lower.startsWith("#") && lower.length > 1) {
    const hit = tagNames.find((t) => t.toLowerCase() === lower.slice(1));
    return hit ? { type: "tag", value: hit, label: `#${hit}` } : null;
  }
  if (lower.startsWith("in:") && lower.length > 3) {
    const f = findProject(folders, token.slice(3));
    return f ? { type: "in", value: f.id, label: `in:${f.name}` } : null;
  }
  const k = KIND_WORDS[lower];
  return k ? { type: "kind", value: k.kind, label: k.label } : null;
}

/** Moves completed filter tokens out of the text into chips (only when a space was typed). */
function absorbTokens(
  raw: string,
  folders: FolderMeta[],
  tagNames: string[],
): { chips: Chip[]; text: string } {
  if (!/\s$/.test(raw) || !raw.trim()) return { chips: [], text: raw };
  const chips: Chip[] = [];
  const rest: string[] = [];
  for (const token of raw.trim().split(/\s+/)) {
    const chip = tokenToChip(token, folders, tagNames);
    if (chip) chips.push(chip);
    else rest.push(token);
  }
  return { chips, text: rest.length ? `${rest.join(" ")} ` : "" };
}

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

function Icon({ icon }: { icon: IconSvgElement }) {
  return (
    <span className="grid size-6 shrink-0 place-items-center rounded-md bg-surface-2">
      <HugeiconsIcon icon={icon} strokeWidth={1.7} className="size-3.5 text-muted-foreground" />
    </span>
  );
}

export function CommandPalette() {
  const open = useShellState((s) => s.paletteOpen);
  const initialQuery = useShellState((s) => s.paletteQuery);
  return (
    <Dialog open={open} onOpenChange={(o) => !o && closePalette()}>
      <DialogContent
        showCloseButton={false}
        className="top-[10vh] max-h-[calc(100dvh-10vh-24px)] translate-y-0 gap-0 overflow-hidden rounded-2xl bg-popover p-0 shadow-pop sm:max-w-[640px]"
      >
        <DialogTitle className="sr-only">Search and commands</DialogTitle>
        {open ? <PaletteBody initialQuery={initialQuery} /> : null}
      </DialogContent>
    </Dialog>
  );
}

const RECENT_QUERY = { limit: 8 } as const;
const COMMON = ["project.new", "file.newFile", "file.upload", "nav.inbox", "app.shortcuts"];

function PaletteBody({ initialQuery }: { initialQuery: string }) {
  const navigate = useNavigate();
  const baseCtx = useCommandContext();
  const commands = useCommandList();
  const foldersQ = useFolders();
  const tagsQ = useTags();
  const [text, setText] = useState(initialQuery);
  const [chips, setChips] = useState<Chip[]>([]);
  const [actionsFor, setActionsFor] = useState<{ ref: ItemRef; label: string } | null>(null);
  const [hl, setHl] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const allFolders = useMemo(() => foldersQ.data ?? [], [foldersQ.data]);
  const tagNames = useMemo(() => (tagsQ.data ?? []).map((t) => t.name), [tagsQ.data]);
  const projects = useMemo(() => allFolders.filter((f) => f.parentId === null), [allFolders]);

  const commandsOnly = text.startsWith(">");
  const lastToken = /(?:^|\s)(\S*)$/.exec(text)?.[1] ?? "";
  const bare = (commandsOnly ? text.slice(1) : text).trim();
  // The search text excludes a filter token still being typed ("#ta", "in:wo").
  const typingFilter = lastToken.startsWith("#") || lastToken.toLowerCase().startsWith("in:");
  const freeText =
    typingFilter && !commandsOnly ? bare.slice(0, bare.length - lastToken.length).trim() : bare;

  const debouncedQ = useDebounced(freeText, 150);

  const tagChips = chips.filter((c) => c.type === "tag").map((c) => c.value);
  const inChip = chips.find((c) => c.type === "in");
  const kindChips = chips.filter((c) => c.type === "kind").map((c) => c.value);
  const filtered = chips.length > 0;
  const searching = !commandsOnly && (debouncedQ.length > 0 || filtered);

  const searchQuery = {
    q: debouncedQ || undefined,
    tags: tagChips.length ? tagChips : undefined,
    folderId: inChip?.value,
    recursive: inChip ? true : undefined,
    limit: 50,
  };
  const search = useQuery({
    queryKey: keys.files.list(searchQuery),
    queryFn: () => files.list(searchQuery),
    enabled: searching,
    staleTime: 10_000,
  });
  const recent = useQuery({
    queryKey: keys.files.list(RECENT_QUERY),
    queryFn: () => files.list(RECENT_QUERY),
    enabled: !searching && !commandsOnly,
    staleTime: 10_000,
  });

  function finish(fn: () => void) {
    closePalette();
    setTimeout(fn, 0);
  }

  function addChip(chip: Chip, replaceLastToken: boolean) {
    setChips((c) => [...c, chip]);
    if (replaceLastToken) setText((t) => t.replace(/\S*$/, ""));
  }

  function onTextChange(raw: string) {
    if (actionsFor || commandsOnly) {
      setText(raw);
      return;
    }
    const { chips: found, text: rest } = absorbTokens(raw, allFolders, tagNames);
    if (found.length) {
      setChips((c) => [...c, ...found]);
      setText(rest);
    } else setText(raw);
  }

  const fileResult = (
    f: FileMeta,
    group: Group,
    positions?: number[],
    withTime?: boolean,
  ): Result => ({
    key: `${group}:file:${f.id}`,
    group,
    label: f.name,
    positions,
    sub: [
      folderPathLabel(allFolders, f.folderId),
      ...f.tags.map((t) => `#${t}`),
      withTime ? relTime(f.updatedAt) : "",
    ]
      .filter(Boolean)
      .join(" · "),
    icon: <TargetIcon type="file" kind={f.kind} />,
    ref: { type: "file", id: f.id },
    run: () => finish(() => itemActions.open({ type: "file", id: f.id })),
  });
  const folderResult = (f: FolderMeta, group: Group, positions?: number[]): Result => ({
    key: `${group}:folder:${f.id}`,
    group,
    label: f.name,
    positions,
    sub: f.parentId === null ? "Project" : folderPathLabel(allFolders, f.parentId),
    icon: f.parentId === null ? <ProjectIcon folder={f} size="sm" /> : <TargetIcon type="folder" />,
    ref: { type: "folder", id: f.id },
    run: () => finish(() => navigate(`/folders/${f.id}`)),
  });
  const commandResult = (c: Command, ctx: CommandContext, positions?: number[]): Result => ({
    key: `cmd:${c.id}`,
    group: actionsFor ? "Actions" : "Commands",
    label: commandLabel(c, ctx),
    positions,
    icon: c.icon ? <Icon icon={c.icon} /> : <span className="size-6" />,
    // App keys aren't active inside editors; only show editor bindings there.
    shortcut:
      ctx.scope === "editor" && !isEditorOnly(c) ? undefined : formatKeys(getEffectiveKeys(c.id)),
    run: () => finish(() => runCommand(c.id, actionsFor ? ctx : undefined)),
  });

  const results: Result[] = (() => {
    // ─── Item action mode ───
    if (actionsFor) {
      const ctx: CommandContext = {
        ...baseCtx,
        selection: [actionsFor.ref],
        focused: actionsFor.ref,
        currentFolderId: undefined,
        route: "/palette",
        scope: baseCtx.scope,
      };
      const cmds = ITEM_MENU_IDS.filter((id) => id !== "-")
        .map((id) => getCommand(id))
        .filter((c): c is Command => !!c && isCommandAvailable(c, ctx) && !c.disabledReason?.(ctx));
      return fuzzyFilter(bare, cmds, (c) => commandLabel(c, ctx)).map((r) =>
        commandResult(r.item, ctx, r.positions),
      );
    }

    const paletteCmds = commands.filter(
      (c) => c.palette !== false && isCommandAvailable(c, baseCtx) && !c.disabledReason?.(baseCtx),
    );

    if (commandsOnly) {
      return fuzzyFilter(bare, paletteCmds, (c) => commandLabel(c, baseCtx), 50).map((r) =>
        commandResult(r.item, baseCtx, r.positions),
      );
    }

    const out: Result[] = [];

    // Filter suggestions for the token being typed.
    if (lastToken.startsWith("#")) {
      const needle = lastToken.slice(1);
      for (const h of fuzzyFilter(needle, tagsQ.data ?? [], (t) => t.name, 6)) {
        out.push({
          key: `tag:${h.item.id}`,
          group: "Tags",
          label: `#${h.item.name}`,
          positions: h.positions.map((p) => p + 1),
          sub: `${h.item.fileCount + h.item.folderCount} items`,
          icon: <Icon icon={HashtagIcon} />,
          keepOpen: true,
          run: () => addChip({ type: "tag", value: h.item.name, label: `#${h.item.name}` }, true),
        });
      }
    } else if (lastToken.toLowerCase().startsWith("in:")) {
      const needle = lastToken.slice(3);
      for (const h of fuzzyFilter(needle, projects, (f) => f.name, 6)) {
        out.push({
          key: `in:${h.item.id}`,
          group: "In project",
          label: h.item.name,
          positions: h.positions,
          sub: `Only search in ${h.item.name}`,
          icon: <ProjectIcon folder={h.item} size="sm" />,
          keepOpen: true,
          run: () => addChip({ type: "in", value: h.item.id, label: `in:${h.item.name}` }, true),
        });
      }
    }

    // ─── Default view: recent, projects, common commands ───
    if (!searching) {
      for (const f of recent.data ?? []) out.push(fileResult(f, "Recent", undefined, true));
      for (const p of projects.slice(0, 6)) out.push(folderResult(p, "Projects"));
      for (const id of COMMON) {
        const c = paletteCmds.find((x) => x.id === id);
        if (c) out.push(commandResult(c, baseCtx));
      }
      return out;
    }

    // ─── Search ───
    if (freeText && !inChip && kindChips.length === 0 && tagChips.length === 0) {
      for (const h of fuzzyFilter(freeText, projects, (f) => f.name, 5)) {
        out.push(folderResult(h.item, "Projects", h.positions));
      }
    }

    const fileHits = (search.data ?? [])
      .filter((f) => kindChips.length === 0 || kindChips.includes(f.kind))
      .map((f) => ({ f, hit: freeText ? fuzzyFilter(freeText, [f], (x) => x.name)[0] : null }))
      .sort((a, b) => (b.hit?.score ?? 0) - (a.hit?.score ?? 0) || b.f.updatedAt - a.f.updatedAt)
      .slice(0, 14);
    for (const { f, hit } of fileHits) out.push(fileResult(f, "Files", hit?.positions));

    if (freeText && !filtered) {
      for (const h of fuzzyFilter(
        freeText,
        allFolders.filter((f) => f.parentId !== null),
        (f) => f.name,
        4,
      )) {
        out.push(folderResult(h.item, "Files", h.positions));
      }
    }

    if (freeText) {
      for (const h of fuzzyFilter(freeText, paletteCmds, (c) => commandLabel(c, baseCtx), 6)) {
        out.push(commandResult(h.item, baseCtx, h.positions));
      }
      // Offer "New note …" only once the search has settled, so a fast ↵
      // opens the hit instead of creating a duplicate.
      if (debouncedQ === freeText && !search.isFetching) {
        out.push({
          key: "create",
          group: "Commands",
          label: `New note named “${freeText}”`,
          icon: <Icon icon={FileAddIcon} />,
          shortcut: isMacPlatform ? "⇧⌘↵" : "Ctrl+Shift+Enter",
          run: () =>
            finish(
              () =>
                void itemActions.newFile(baseCtx.currentFolderId ?? null, "notes", {
                  name: freeText,
                }),
            ),
        });
      }
    }
    return out;
  })();

  // Reset the highlight whenever the result set's identity changes.
  const resetKey = `${commandsOnly}|${bare}|${chips.length}|${actionsFor?.ref.id ?? ""}`;
  const [lastResetKey, setLastResetKey] = useState(resetKey);
  if (lastResetKey !== resetKey) {
    setLastResetKey(resetKey);
    setHl(0);
  }
  const safeHl = Math.min(hl, Math.max(0, results.length - 1));
  const current = results[safeHl];

  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>(`[data-idx="${safeHl}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [safeHl]);

  function exitActions() {
    setActionsFor(null);
    setText("");
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    const mod = isMacPlatform ? e.metaKey : e.ctrlKey;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const d = e.key === "ArrowDown" ? 1 : -1;
      setHl((i) =>
        results.length
          ? (Math.min(i, results.length - 1) + d + results.length) % results.length
          : 0,
      );
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (mod && e.shiftKey && freeText) {
        results.find((r) => r.key === "create")?.run();
      } else if (mod && current?.ref) {
        const ref = current.ref;
        finish(() => itemActions.reveal(ref));
      } else {
        current?.run();
      }
    } else if (e.key === "Tab") {
      e.preventDefault();
      if (e.shiftKey || actionsFor) {
        if (actionsFor) exitActions();
      } else if (current?.keepOpen) {
        current.run();
      } else if (current?.ref) {
        setActionsFor({ ref: current.ref, label: current.label });
        setText("");
      }
    } else if (e.key === "Escape" && actionsFor) {
      e.preventDefault();
      e.stopPropagation();
      exitActions();
    } else if (e.key === "Backspace" && !text) {
      if (actionsFor) setActionsFor(null);
      else if (chips.length) {
        e.preventDefault();
        setChips((c) => c.slice(0, -1));
      }
    }
  }

  // Group rows preserving first-appearance order.
  let lastGroup = "";
  const busy = searching && search.isFetching;

  return (
    <div className="flex min-h-0 flex-col">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 border-b border-border px-4 py-3">
        <HugeiconsIcon
          icon={Search01Icon}
          strokeWidth={1.8}
          className="size-[18px] shrink-0 text-muted-foreground"
        />
        {actionsFor ? (
          <span className="max-w-[40%] shrink-0 truncate rounded-full bg-accent-soft px-2.5 py-0.5 text-xs font-medium text-accent-text">
            {actionsFor.label}
          </span>
        ) : null}
        {chips.map((c, i) => (
          <span
            key={`${c.type}:${c.value}`}
            className="inline-flex h-6 shrink-0 items-center gap-1 rounded-full bg-accent-soft pr-1 pl-2.5 text-xs font-medium text-accent-text"
          >
            {c.label}
            <button
              type="button"
              tabIndex={-1}
              aria-label={`Remove filter ${c.label}`}
              onClick={() => setChips((all) => all.filter((_, j) => j !== i))}
              className="grid size-4 place-items-center rounded-full hover:bg-accent-text/15"
            >
              <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2.2} className="size-2.5" />
            </button>
          </span>
        ))}
        <input
          // biome-ignore lint/a11y/noAutofocus: palette input must take focus on open
          autoFocus
          value={text}
          onChange={(e) => onTextChange(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={
            actionsFor
              ? "Choose an action…"
              : chips.length
                ? "Add words or filters…"
                : "Search files, projects, commands…"
          }
          aria-label="Search and commands"
          aria-controls="palette-results"
          aria-activedescendant={current ? `palette-${safeHl}` : undefined}
          className="h-7 min-w-[8rem] flex-1 bg-transparent text-[15px] text-foreground outline-none placeholder:text-faint"
        />
        {busy ? <span className="text-[11px] text-muted-foreground">searching…</span> : null}
      </div>
      <div
        ref={listRef}
        id="palette-results"
        role="listbox"
        className="max-h-[min(460px,58dvh)] overflow-y-auto py-1.5 [scrollbar-gutter:stable]"
      >
        {results.map((r, i) => {
          const header = r.group !== lastGroup ? r.group : null;
          lastGroup = r.group;
          return (
            <div key={r.key}>
              {header ? (
                <div className="px-[18px] pt-2.5 pb-1 text-[10.5px] font-semibold tracking-[0.08em] text-faint uppercase">
                  {header}
                </div>
              ) : null}
              <div
                id={`palette-${i}`}
                data-idx={i}
                role="option"
                aria-selected={i === safeHl}
                tabIndex={-1}
                onMouseMove={() => i !== safeHl && setHl(i)}
                onClick={() => r.run()}
                onKeyDown={() => undefined}
                className={cn(
                  "relative mx-1.5 flex h-10 cursor-default items-center gap-3 rounded-lg px-3 text-[13.5px] text-foreground",
                  i === safeHl && "bg-accent-soft",
                )}
              >
                {r.icon}
                <span className="min-w-0 shrink truncate">
                  {highlightSegments(r.label, r.positions ?? []).map((s, j) =>
                    s.match ? (
                      // biome-ignore lint/suspicious/noArrayIndexKey: static segments
                      <b key={j} className="font-semibold text-accent-text">
                        {s.text}
                      </b>
                    ) : (
                      // biome-ignore lint/suspicious/noArrayIndexKey: static segments
                      <span key={j}>{s.text}</span>
                    ),
                  )}
                </span>
                {r.sub ? (
                  <small className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                    {r.sub}
                  </small>
                ) : (
                  <span className="flex-1" />
                )}
                {r.shortcut ? (
                  <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
                    {r.shortcut}
                  </span>
                ) : null}
              </div>
            </div>
          );
        })}
        {results.length === 0 ? (
          <div className="px-[18px] py-8 text-center text-sm text-muted-foreground">
            {busy ? "Searching…" : "No results"}
          </div>
        ) : null}
        {!actionsFor && !text && chips.length === 0 ? (
          <div className="px-[18px] pt-3 pb-1 text-xs text-muted-foreground">
            Filter with <b className="font-medium text-foreground">#tag</b>,{" "}
            <b className="font-medium text-foreground">in:project</b> or a kind like{" "}
            <b className="font-medium text-foreground">note</b>, then press space. Start with{" "}
            <b className="font-medium text-foreground">&gt;</b> for commands only.
          </div>
        ) : null}
      </div>
      <div className="hidden items-center gap-3.5 border-t border-border bg-surface-2 px-4 py-2.5 text-[11.5px] text-muted-foreground sm:flex">
        <span>
          <Kbd>↑</Kbd>
          <Kbd>↓</Kbd> move
        </span>
        <span>
          <Kbd>↵</Kbd> open
        </span>
        <span>
          <Kbd>{isMacPlatform ? "⌘" : "Ctrl"}</Kbd>
          <Kbd>↵</Kbd> reveal
        </span>
        <span>
          <Kbd>Tab</Kbd> actions
        </span>
        <span className="flex-1" />
        <Kbd>Esc</Kbd>
      </div>
    </div>
  );
}
