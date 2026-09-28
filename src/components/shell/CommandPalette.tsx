// Command palette (wireframe screen 10), opened with ⌘K / Ctrl+K or the
// top-bar search trigger.
//
// Prefixes: ">" commands only · "/" folders only · "#" tags only.
// Empty query → recent + starred items and common commands.
// ↑/↓ navigate · ↵ open/run · ⌘/Ctrl+↵ reveal item in its folder ·
// Tab → action list for the highlighted item (⇧Tab / Esc back) ·
// ⌘/Ctrl+⇧+↵ create an Excalidraw drawing named after the query.

import {
  FileAddIcon,
  FolderLibraryIcon,
  HashtagIcon,
  Search01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import { useQuery } from "@tanstack/react-query";
import { type KeyboardEvent, type ReactNode, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FileKindGlyph } from "@/components/sketch/file-kind-icons";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { useFolders } from "@/data/folders";
import { useTags } from "@/data/tags";
import { folderPathLabel } from "@/features/actions/itemCache";
import { ITEM_MENU_IDS } from "@/features/actions/itemCommands";
import { itemActions } from "@/features/actions/useItemActions";
import {
  type FileKind,
  type FileMeta,
  type FolderMeta,
  files,
  type ItemRef,
} from "@/lib/api/client";
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
import { cn } from "@/lib/utils";
import { Kbd } from "./Kbd";
import { closePalette, useShellState } from "./shellStore";
import { tagColor } from "./tagColor";

interface Result {
  key: string;
  group: "Files & folders" | "Commands" | "Tags" | "Actions" | "Recent" | "Starred";
  label: string;
  positions?: number[];
  sub?: string;
  icon: ReactNode;
  shortcut?: string;
  ref?: ItemRef;
  run: () => void;
}

const RECENT_QUERY = { limit: 8 } as const;
const STARRED_QUERY = { starred: true } as const;

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
    <HugeiconsIcon
      icon={icon}
      strokeWidth={1.8}
      className="size-4 shrink-0 text-muted-foreground"
    />
  );
}

function KindIcon({ kind }: { kind?: FileKind }) {
  return kind ? (
    <FileKindGlyph kind={kind} variant="full" className="size-[18px] shrink-0 rounded" />
  ) : (
    <HugeiconsIcon
      icon={FolderLibraryIcon}
      strokeWidth={1.7}
      className="size-[18px] shrink-0 text-folder"
    />
  );
}

export function CommandPalette() {
  const open = useShellState((s) => s.paletteOpen);
  const initialQuery = useShellState((s) => s.paletteQuery);
  return (
    <Dialog open={open} onOpenChange={(o) => !o && closePalette()}>
      <DialogContent
        showCloseButton={false}
        className="top-[80px] max-h-[calc(100dvh-120px)] translate-y-0 gap-0 overflow-hidden p-0 sm:max-w-[620px]"
      >
        <DialogTitle className="sr-only">Command palette</DialogTitle>
        {open ? <PaletteBody initialQuery={initialQuery} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function PaletteBody({ initialQuery }: { initialQuery: string }) {
  const navigate = useNavigate();
  const baseCtx = useCommandContext();
  const commands = useCommandList();
  const foldersQ = useFolders();
  const tagsQ = useTags();
  const [query, setQuery] = useState(initialQuery);
  const [actionsFor, setActionsFor] = useState<{ ref: ItemRef; label: string } | null>(null);
  const [hl, setHl] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const prefix = query.startsWith(">")
    ? ">"
    : query.startsWith("/")
      ? "/"
      : query.startsWith("#")
        ? "#"
        : "";
  const q = (prefix ? query.slice(1) : query).trim();
  const debouncedQ = useDebounced(q, 150);
  const allFolders = foldersQ.data ?? [];

  const search = useQuery({
    queryKey: keys.files.list({ q: debouncedQ, limit: 20 }),
    queryFn: () => files.list({ q: debouncedQ, limit: 20 }),
    enabled: !prefix && debouncedQ.length > 0,
    staleTime: 10_000,
  });
  const recent = useQuery({
    queryKey: keys.files.list(RECENT_QUERY),
    queryFn: () => files.list(RECENT_QUERY),
    enabled: !q && !prefix,
    staleTime: 10_000,
  });
  const starred = useQuery({
    queryKey: keys.files.list(STARRED_QUERY),
    queryFn: () => files.list(STARRED_QUERY),
    enabled: !q && !prefix,
    retry: false,
  });

  function finish(fn: () => void) {
    closePalette();
    setTimeout(fn, 0);
  }

  const fileResult = (f: FileMeta, group: Result["group"], positions?: number[]): Result => ({
    key: `${group}:file:${f.id}`,
    group,
    label: f.name,
    positions,
    sub: [folderPathLabel(allFolders, f.folderId), ...f.tags.map((t) => `#${t}`)].join(" · "),
    icon: <KindIcon kind={f.kind} />,
    ref: { type: "file", id: f.id },
    run: () => finish(() => itemActions.open({ type: "file", id: f.id })),
  });
  const folderResult = (f: FolderMeta, group: Result["group"], positions?: number[]): Result => ({
    key: `${group}:folder:${f.id}`,
    group,
    label: f.name,
    positions,
    sub: folderPathLabel(allFolders, f.parentId),
    icon: <KindIcon />,
    ref: { type: "folder", id: f.id },
    run: () => finish(() => navigate(`/folders/${f.id}`)),
  });
  const commandResult = (c: Command, ctx: CommandContext, positions?: number[]): Result => ({
    key: `cmd:${c.id}`,
    group: actionsFor ? "Actions" : "Commands",
    label: commandLabel(c, ctx),
    positions,
    icon: c.icon ? <Icon icon={c.icon} /> : <span className="size-4" />,
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
      return fuzzyFilter(q, cmds, (c) => commandLabel(c, ctx)).map((r) =>
        commandResult(r.item, ctx, r.positions),
      );
    }

    const out: Result[] = [];
    const paletteCmds = commands.filter(
      (c) => c.palette !== false && isCommandAvailable(c, baseCtx) && !c.disabledReason?.(baseCtx),
    );

    if (prefix === ">") {
      return fuzzyFilter(q, paletteCmds, (c) => commandLabel(c, baseCtx), 50).map((r) =>
        commandResult(r.item, baseCtx, r.positions),
      );
    }
    if (prefix === "/") {
      return fuzzyFilter(q, allFolders, (f) => f.name, 50).map((r) =>
        folderResult(r.item, "Files & folders", r.positions),
      );
    }
    if (prefix === "#") {
      return fuzzyFilter(q, tagsQ.data ?? [], (t) => t.name, 50).map((r) => ({
        key: `tag:${r.item.id}`,
        group: "Tags" as const,
        label: `#${r.item.name}`,
        positions: r.positions.map((p) => p + 1),
        sub: `${r.item.fileCount + r.item.folderCount} items`,
        icon: (
          <span
            className="mx-1 size-2.5 rounded-full"
            style={{ background: tagColor(r.item.name) }}
          />
        ),
        run: () => finish(() => navigate(`/tags/${encodeURIComponent(r.item.name)}`)),
      }));
    }

    if (!q) {
      const starredFolders = allFolders.filter((f) => f.starredAt);
      for (const f of (starred.data ?? []).slice(0, 5)) out.push(fileResult(f, "Starred"));
      for (const f of starredFolders.slice(0, 5)) out.push(folderResult(f, "Starred"));
      const seen = new Set(out.map((r) => r.ref?.id));
      for (const f of recent.data ?? []) if (!seen.has(f.id)) out.push(fileResult(f, "Recent"));
      const common = [
        "file.newFile",
        "file.newFolder",
        "file.upload",
        "nav.recent",
        "nav.trash",
        "app.shortcuts",
      ];
      for (const id of common) {
        const c = paletteCmds.find((x) => x.id === id);
        if (c) out.push(commandResult(c, baseCtx));
      }
      return out;
    }

    // ─── Everything ───
    const folderHits = fuzzyFilter(q, allFolders, (f) => f.name, 6);
    const fileHits = fuzzyFilter(q, search.data ?? [], (f) => f.name, 12);
    const merged = [
      ...fileHits.map((h) => ({
        score: h.score,
        r: fileResult(h.item, "Files & folders", h.positions),
      })),
      ...folderHits.map((h) => ({
        score: h.score,
        r: folderResult(h.item, "Files & folders", h.positions),
      })),
    ].sort((a, b) => b.score - a.score);
    // Server matches on tags/paths too; keep those even if the name doesn't fuzzy-match.
    const shown = new Set(merged.map((m) => m.r.ref?.id));
    for (const f of search.data ?? []) {
      if (!shown.has(f.id) && merged.length < 14)
        merged.push({ score: 0, r: fileResult(f, "Files & folders") });
    }
    out.push(...merged.map((m) => m.r));
    for (const h of fuzzyFilter(q, paletteCmds, (c) => commandLabel(c, baseCtx), 6)) {
      out.push(commandResult(h.item, baseCtx, h.positions));
    }
    for (const h of fuzzyFilter(q, tagsQ.data ?? [], (t) => t.name, 3)) {
      out.push({
        key: `tag:${h.item.id}`,
        group: "Commands",
        label: `Filter by tag: #${h.item.name}`,
        icon: <Icon icon={HashtagIcon} />,
        run: () => finish(() => navigate(`/tags/${encodeURIComponent(h.item.name)}`)),
      });
    }
    // Offer "Create …" only once the search has settled, so a fast ↵
    // opens the hit instead of creating a duplicate.
    if (debouncedQ !== q || search.isFetching) return out;
    out.push({
      key: "create",
      group: "Commands",
      label: `Create Excalidraw drawing named “${q}”`,
      icon: <Icon icon={FileAddIcon} />,
      shortcut: isMacPlatform ? "⇧⌘↵" : "Ctrl+Shift+Enter",
      run: () =>
        finish(
          () =>
            void itemActions.newFile(baseCtx.currentFolderId ?? null, "excalidraw", { name: q }),
        ),
    });
    return out;
  })();

  // Reset the highlight whenever the result set's identity changes.
  const resetKey = `${prefix}|${q}|${actionsFor?.ref.id ?? ""}`;
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
      if (mod && e.shiftKey && q) {
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
        if (actionsFor) {
          setActionsFor(null);
          setQuery("");
        }
      } else if (current?.ref) {
        setActionsFor({ ref: current.ref, label: current.label });
        setQuery("");
      }
    } else if (e.key === "Escape" && actionsFor) {
      e.preventDefault();
      e.stopPropagation();
      setActionsFor(null);
      setQuery("");
    } else if (e.key === "Backspace" && !query && actionsFor) {
      setActionsFor(null);
    }
  }

  // Group rows preserving first-appearance order.
  let lastGroup = "";

  return (
    <div className="flex min-h-0 flex-col">
      <div className="flex items-center gap-2.5 border-b border-border px-4 py-3">
        <HugeiconsIcon
          icon={Search01Icon}
          strokeWidth={2}
          className="size-[18px] shrink-0 text-muted-foreground"
        />
        {actionsFor ? (
          <span className="max-w-[40%] shrink-0 truncate rounded-md bg-accent px-2 py-0.5 text-xs text-accent-foreground">
            {actionsFor.label}
          </span>
        ) : null}
        <input
          // biome-ignore lint/a11y/noAutofocus: palette input must take focus on open
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={actionsFor ? "Choose an action…" : "Search files, folders, tags, commands…"}
          aria-label="Command palette search"
          aria-controls="palette-results"
          aria-activedescendant={current ? `palette-${safeHl}` : undefined}
          className="h-7 min-w-0 flex-1 bg-transparent text-[15px] text-foreground outline-none placeholder:text-muted-foreground"
        />
        {search.isFetching ? (
          <span className="text-[11px] text-muted-foreground">searching…</span>
        ) : null}
      </div>
      <div
        ref={listRef}
        id="palette-results"
        role="listbox"
        className="max-h-[min(460px,60dvh)] overflow-y-auto py-1.5 [scrollbar-gutter:stable]"
      >
        {results.map((r, i) => {
          const header = r.group !== lastGroup ? r.group : null;
          lastGroup = r.group;
          return (
            <div key={r.key}>
              {header ? (
                <div className="px-[18px] pt-2.5 pb-1 text-[10.5px] tracking-[0.08em] text-muted-foreground uppercase">
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
                  "relative mx-1.5 flex h-9 cursor-default items-center gap-2.5 rounded-lg px-3 text-[13.5px] text-foreground",
                  i === safeHl && "bg-accent text-accent-foreground",
                )}
              >
                {r.icon}
                <span className="min-w-0 shrink truncate">
                  {highlightSegments(r.label, r.positions ?? []).map((s, j) =>
                    s.match ? (
                      // biome-ignore lint/suspicious/noArrayIndexKey: static segments
                      <b key={j} className="font-semibold text-primary">
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
                {i === safeHl && r.ref ? (
                  <span className="absolute right-3 hidden items-center gap-1 bg-accent pl-3 text-[11px] text-muted-foreground sm:flex">
                    <Kbd>↵</Kbd> open · <Kbd>{isMacPlatform ? "⌘" : "Ctrl"}</Kbd>
                    <Kbd>↵</Kbd> reveal · <Kbd>Tab</Kbd> actions
                  </span>
                ) : r.shortcut ? (
                  <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
                    {r.shortcut}
                  </span>
                ) : null}
              </div>
            </div>
          );
        })}
        {results.length === 0 ? (
          <div className="px-[18px] py-6 text-center text-sm text-muted-foreground">
            {search.isFetching ? "Searching…" : "No results"}
          </div>
        ) : null}
        {!actionsFor && !q ? (
          <div className="px-[18px] pt-3 pb-1 text-xs text-muted-foreground">
            Try <b className="text-foreground">&gt;</b> commands only ·{" "}
            <b className="text-foreground">/</b> folders · <b className="text-foreground">#</b> tags
          </div>
        ) : null}
      </div>
      <div className="hidden items-center gap-3.5 border-t border-border px-4 py-2.5 text-[11.5px] text-muted-foreground sm:flex">
        <span>
          <Kbd>↑</Kbd>
          <Kbd>↓</Kbd> navigate
        </span>
        <span>
          <Kbd>↵</Kbd> open
        </span>
        <span>
          <Kbd>{isMacPlatform ? "⌘" : "Ctrl"}</Kbd>
          <Kbd>↵</Kbd> reveal in folder
        </span>
        <span>
          <Kbd>Tab</Kbd> actions for item
        </span>
        <span className="flex-1" />
        <Kbd>Esc</Kbd>
      </div>
    </div>
  );
}
