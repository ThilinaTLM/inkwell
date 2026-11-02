// "Saving to <place>" picker used by the capture dialog: Inbox, recent
// destinations, then every folder with its path.

import { Popover } from "@base-ui/react/popover";
import { ArrowDown01Icon, InboxIcon, Search01Icon, Tick02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useMemo, useState } from "react";
import { ProjectIcon } from "@/components/project/ProjectIcon";
import { useFolders } from "@/data/folders";
import { folderPath } from "@/data/home";
import { useRecentDestinations } from "@/features/actions/recentDestinations";
import type { FolderMeta } from "@/lib/api/client";
import { fuzzyFilter } from "@/lib/commands/fuzzy";
import { cn } from "@/lib/utils";

function pathLabel(all: FolderMeta[], id: string): string {
  return folderPath(all, id)
    .map((c) => c.name)
    .join(" / ");
}

function Tile({ folder }: { folder: FolderMeta | null }) {
  if (!folder) {
    return (
      <span className="grid size-5 shrink-0 place-items-center rounded-md bg-accent-soft text-accent-text">
        <HugeiconsIcon icon={InboxIcon} strokeWidth={1.8} className="size-3" />
      </span>
    );
  }
  return <ProjectIcon folder={folder.parentId ? null : folder} size="xs" />;
}

interface Opt {
  key: string;
  folder: FolderMeta | null;
  label: string;
}

export function DestinationMenu({
  value,
  onChange,
  className,
}: {
  value: string | null;
  onChange: (folderId: string | null) => void;
  className?: string;
}) {
  const foldersQ = useFolders();
  const all = useMemo(() => foldersQ.data ?? [], [foldersQ.data]);
  const recentIds = useRecentDestinations();
  const current = value ? (all.find((f) => f.id === value) ?? null) : null;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [hl, setHl] = useState(0);

  const list = useMemo(
    () =>
      all
        .map((f) => ({ f, label: pathLabel(all, f.id) }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    [all],
  );
  const recent = recentIds
    .filter((id): id is string => id !== null && all.some((f) => f.id === id))
    .slice(0, 4);

  const q = query.trim();
  const sections = useMemo(() => {
    const inbox: Opt = { key: "inbox", folder: null, label: "Inbox" };
    if (q) {
      const hits = fuzzyFilter(q, list, (x) => x.label, 30).map<Opt>((h) => ({
        key: h.item.f.id,
        folder: h.item.f,
        label: h.item.label,
      }));
      const out: Array<{ title: string | null; opts: Opt[] }> = [];
      const showInbox = "inbox".includes(q.toLowerCase());
      if (showInbox || hits.length)
        out.push({ title: null, opts: showInbox ? [inbox, ...hits] : hits });
      return out;
    }
    const out: Array<{ title: string | null; opts: Opt[] }> = [{ title: null, opts: [inbox] }];
    if (recent.length) {
      out.push({
        title: "Recent",
        opts: recent.flatMap((id) => {
          const f = all.find((x) => x.id === id);
          return f ? [{ key: `r-${id}`, folder: f, label: pathLabel(all, id) }] : [];
        }),
      });
    }
    if (list.length) {
      out.push({
        title: "All folders",
        opts: list.map(({ f, label }) => ({ key: f.id, folder: f, label })),
      });
    }
    return out;
  }, [q, list, recent, all]);
  const flat = sections.flatMap((s) => s.opts);
  const safeHl = Math.min(hl, Math.max(0, flat.length - 1));

  const pick = (o: Opt) => {
    onChange(o.folder?.id ?? null);
    setOpen(false);
  };

  return (
    <Popover.Root
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) {
          setQuery("");
          setHl(0);
        }
      }}
    >
      <Popover.Trigger
        aria-label="Change destination"
        className={cn(
          "inline-flex h-8 max-w-full items-center gap-1.5 rounded-[10px] border border-border bg-surface-2 px-2.5 text-[13px] font-medium text-foreground outline-none transition-colors hover:border-input focus-visible:ring-2 focus-visible:ring-ring/60 aria-expanded:border-input",
          className,
        )}
      >
        <Tile folder={current} />
        <span className="truncate">
          {current ? pathLabel(all, current.id) : value ? "Folder" : "Inbox"}
        </span>
        <HugeiconsIcon
          icon={ArrowDown01Icon}
          strokeWidth={2}
          className="size-3 shrink-0 text-muted-foreground"
        />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner align="start" sideOffset={6} className="isolate z-[60] outline-none">
          <Popover.Popup className="flex max-h-80 w-80 origin-(--transform-origin) flex-col overflow-hidden rounded-xl bg-popover font-sans text-sm text-popover-foreground ring-1 ring-border shadow-[0_18px_40px_-14px_rgba(28,24,20,0.35)] outline-none duration-150 data-closed:animate-out data-closed:fade-out-0 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95">
            <div className="flex items-center gap-2 border-b border-border px-3">
              <HugeiconsIcon
                icon={Search01Icon}
                strokeWidth={1.8}
                className="size-3.5 shrink-0 text-faint"
              />
              <input
                // biome-ignore lint/a11y/noAutofocus: search field is the point of the popover
                autoFocus
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setHl(0);
                }}
                onKeyDown={(e) => {
                  if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                    e.preventDefault();
                    const d = e.key === "ArrowDown" ? 1 : -1;
                    setHl(flat.length ? (safeHl + d + flat.length) % flat.length : 0);
                  } else if (e.key === "Enter") {
                    e.preventDefault();
                    const o = flat[safeHl];
                    if (o) pick(o);
                  }
                }}
                placeholder="Find a project or folder…"
                aria-label="Find a destination"
                role="combobox"
                aria-expanded="true"
                aria-controls="dest-list"
                className="h-10 w-full bg-transparent text-sm outline-none placeholder:text-faint"
              />
            </div>
            <div id="dest-list" role="listbox" className="min-h-0 flex-1 overflow-y-auto p-1">
              {flat.length === 0 ? (
                <p className="px-3 py-6 text-center text-sm text-muted-foreground">
                  No matching folders.
                </p>
              ) : null}
              {sections.map((sec) => (
                <div key={sec.title ?? "top"}>
                  {sec.title ? (
                    <div className="px-2.5 pt-2 pb-1 text-[11px] font-semibold tracking-wide text-faint uppercase">
                      {sec.title}
                    </div>
                  ) : null}
                  {sec.opts.map((o) => {
                    const idx = flat.indexOf(o);
                    return (
                      <div
                        key={o.key}
                        role="option"
                        tabIndex={-1}
                        aria-selected={(o.folder?.id ?? null) === value}
                        data-hl={idx === safeHl}
                        ref={(el) => {
                          if (el && idx === safeHl) el.scrollIntoView({ block: "nearest" });
                        }}
                        onMouseMove={() => setHl(idx)}
                        onClick={() => pick(o)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") pick(o);
                        }}
                        className="flex cursor-default items-center gap-2 rounded-lg px-2.5 py-1.5 data-[hl=true]:bg-muted"
                      >
                        <Tile folder={o.folder} />
                        <span className="min-w-0 flex-1 truncate">{o.label}</span>
                        {(o.folder?.id ?? null) === value ? (
                          <HugeiconsIcon
                            icon={Tick02Icon}
                            strokeWidth={2}
                            className="size-3.5 text-primary"
                          />
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
