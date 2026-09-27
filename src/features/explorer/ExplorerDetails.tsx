// Details panel content for the explorer (portalled via the shell's
// <DetailsPanel>): single file, single folder, multi-selection summary,
// or the current folder when nothing is selected.

import {
  Copy01Icon,
  Delete02Icon,
  Download01Icon,
  FolderOpenIcon,
  FolderTransferIcon,
  Link04Icon,
  PlusSignIcon,
  Share08Icon,
  StarIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { type ReactNode, useMemo, useState } from "react";
import { DetailsPanel } from "@/components/shell/DetailsPanel";
import { Button } from "@/components/ui/button";
import { useShareList } from "@/data/shares";
import { useTags } from "@/data/tags";
import { useItemMeta } from "@/features/actions/itemCache";
import { itemActions } from "@/features/actions/useItemActions";
import type { FileMeta, FolderMeta, ItemRef } from "@/lib/api/client";
import { runCommand } from "@/lib/commands/registry";
import { expiresPhrase, fmtDateTime } from "@/lib/format";
import { parseRefKey } from "@/lib/selection";
import { cn } from "@/lib/utils";
import {
  type ExplorerItem,
  fileToItem,
  folderToItem,
  formatBytes,
  KIND_META,
  summarize,
} from "./model";
import { useSelectedKeys } from "./state";
import { ItemPreview, PropertyList } from "./views/ItemPreview";
import { ItemThumb, TagPill } from "./views/ItemVisuals";

export function ExplorerDetails({
  scope,
  items,
  folder,
  folderId,
  onOpen,
}: {
  scope: string;
  items: ExplorerItem[];
  /** The folder being browsed (null on Home). */
  folder: FolderMeta | null;
  folderId: string | null;
  onOpen: (item: ExplorerItem) => void;
}) {
  const keys = useSelectedKeys(scope);
  const byKey = useMemo(() => new Map(items.map((i) => [i.key, i])), [items]);
  const selected = keys.map((k) => byKey.get(k)).filter((i): i is ExplorerItem => !!i);
  const single = keys.length === 1 ? keys[0] : null;

  if (single) {
    return (
      <DetailsPanel>
        <SingleDetails itemKey={single} known={byKey.get(single)} onOpen={onOpen} />
      </DetailsPanel>
    );
  }
  if (keys.length > 1) {
    return (
      <DetailsPanel title={`${keys.length} items selected`}>
        <MultiDetails items={selected} />
      </DetailsPanel>
    );
  }
  return (
    <DetailsPanel title={folder ? "Folder" : "Home"}>
      <FolderSummary folder={folder} folderId={folderId} items={items} />
    </DetailsPanel>
  );
}

function Section({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="mt-3 border-t border-border pt-2.5">
      <h4 className="mb-2 flex items-center justify-between text-[10.5px] font-normal tracking-[0.09em] text-muted-foreground uppercase">
        <span>{title}</span>
        {action}
      </h4>
      {children}
    </section>
  );
}

function useResolvedItem(itemKey: string, known: ExplorerItem | undefined): ExplorerItem | null {
  const ref = parseRefKey(itemKey);
  const meta = useItemMeta(known ? null : ref);
  if (known) return known;
  if (!meta || !ref) return null;
  return ref.type === "folder" ? folderToItem(meta as FolderMeta) : fileToItem(meta as FileMeta);
}

function SingleDetails({
  itemKey,
  known,
  onOpen,
}: {
  itemKey: string;
  known?: ExplorerItem;
  onOpen: (item: ExplorerItem) => void;
}) {
  const item = useResolvedItem(itemKey, known);
  if (!item) return <p className="text-xs text-muted-foreground">Loading…</p>;
  return (
    <div className="pb-4">
      <ItemPreview item={item} withTags={false} />
      <div className="mt-3 flex flex-wrap gap-1.5">
        <Button size="sm" onClick={() => onOpen(item)}>
          <HugeiconsIcon icon={FolderOpenIcon} strokeWidth={2} />
          Open
        </Button>
        <Button size="sm" variant="outline" onClick={() => itemActions.share(item.ref)}>
          <HugeiconsIcon icon={Share08Icon} strokeWidth={2} />
          Share
        </Button>
        <Button
          size="icon-sm"
          variant="outline"
          aria-label="Download"
          title="Download"
          onClick={() => void itemActions.download([item.ref])}
        >
          <HugeiconsIcon icon={Download01Icon} strokeWidth={2} />
        </Button>
        <Button
          size="icon-sm"
          variant="outline"
          aria-label={item.starred ? "Remove from Starred" : "Add to Starred"}
          aria-pressed={item.starred}
          title={item.starred ? "Remove from Starred" : "Add to Starred"}
          onClick={() => void itemActions.setStar([item.ref], !item.starred)}
        >
          <HugeiconsIcon
            icon={StarIcon}
            strokeWidth={2}
            className={cn(item.starred && "fill-primary text-primary")}
          />
        </Button>
      </div>
      <Section title="Tags">
        <TagEditor refs={[item.ref]} tags={item.tags} />
      </Section>
      <ShareLinks itemRef={item.ref} />
    </div>
  );
}

export function TagEditor({
  refs,
  tags,
  addLabel = "+ add",
}: {
  refs: ItemRef[];
  tags: string[];
  addLabel?: string;
}) {
  const all = useTags();
  const [adding, setAdding] = useState(false);
  const [value, setValue] = useState("");
  const listId = `tag-suggest-${refs[0]?.id ?? "x"}`;
  const add = () => {
    const t = value.trim();
    setValue("");
    setAdding(false);
    if (!t) return;
    void itemActions.setTags(refs, (prev) =>
      prev.some((p) => p.toLowerCase() === t.toLowerCase()) ? prev : [...prev, t],
    );
  };
  return (
    <div className="flex flex-wrap items-center gap-1">
      {tags.map((t) => (
        <TagPill
          key={t}
          tag={t}
          onRemove={() =>
            void itemActions.setTags(refs, (prev) =>
              prev.filter((p) => p.toLowerCase() !== t.toLowerCase()),
            )
          }
        />
      ))}
      {adding ? (
        <>
          <input
            // biome-ignore lint/a11y/noAutofocus: opened by an explicit click
            autoFocus
            list={listId}
            value={value}
            aria-label="Add tag"
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "Enter") add();
              if (e.key === "Escape") {
                setValue("");
                setAdding(false);
              }
            }}
            onBlur={add}
            className="h-5 w-28 rounded-full border border-primary bg-card px-2 text-[11px] outline-none"
          />
          <datalist id={listId}>
            {(all.data ?? []).map((t) => (
              <option key={t.id} value={t.name} />
            ))}
          </datalist>
        </>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="inline-flex h-5 items-center rounded-full border border-dashed border-border px-2 text-[11px] text-muted-foreground hover:border-primary hover:text-foreground"
        >
          {addLabel}
        </button>
      )}
    </div>
  );
}

function ShareLinks({ itemRef }: { itemRef: ItemRef }) {
  const list = useShareList(itemRef.type, itemRef.id);
  const now = Date.now();
  const active = (list.data ?? []).filter((s) => s.expiresAt === null || s.expiresAt > now);
  return (
    <Section
      title="Share links"
      action={
        <button
          type="button"
          aria-label="New share link"
          title="New share link"
          onClick={() => itemActions.share(itemRef)}
          className="grid size-4 place-items-center rounded hover:bg-muted hover:text-foreground"
        >
          <HugeiconsIcon icon={PlusSignIcon} strokeWidth={2} className="size-3" />
        </button>
      }
    >
      {list.isPending ? (
        <p className="text-xs text-muted-foreground">Loading…</p>
      ) : active.length === 0 ? (
        <p className="text-xs text-muted-foreground">No active links</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {active.map((s) => (
            <li key={s.token}>
              <button
                type="button"
                onClick={() => itemActions.share(itemRef)}
                className="flex w-full items-center gap-2 rounded-lg border border-border px-2 py-1.5 text-left text-xs hover:bg-muted"
              >
                <HugeiconsIcon icon={Link04Icon} strokeWidth={2} className="size-3.5 shrink-0" />
                <span className="min-w-0 flex-1 truncate">{s.label || "Share link"}</span>
                <span
                  className={cn(
                    "rounded px-1.5 text-[10.5px]",
                    s.permission === "write"
                      ? "bg-accent text-accent-foreground"
                      : "bg-muted text-muted-foreground",
                  )}
                >
                  {s.permission === "write" ? "Edit" : "View"}
                </span>
                <span className="text-muted-foreground">
                  {expiresPhrase(s.expiresAt)?.replace("expires in ", "") ?? "∞"}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

function MultiDetails({ items }: { items: ExplorerItem[] }) {
  const sum = summarize(items);
  const refs = items.map((i) => i.ref);
  const kinds = new Map<string, number>();
  for (const i of items)
    kinds.set(KIND_META[i.kind].label, (kinds.get(KIND_META[i.kind].label) ?? 0) + 1);
  const common = items.length
    ? items[0].tags.filter((t) =>
        items.every((i) => i.tags.some((x) => x.toLowerCase() === t.toLowerCase())),
      )
    : [];
  const times = items.map((i) => i.updatedAt).sort((a, b) => a - b);
  return (
    <div className="pb-4">
      <div className="grid grid-cols-3 gap-1.5">
        {items.slice(0, 3).map((i) => (
          <ItemThumb key={i.key} item={i} className="h-[60px] w-full" />
        ))}
      </div>
      <Section title="Summary">
        <PropertyList
          rows={[
            ["Kinds", [...kinds].map(([k, n]) => `${n} ${k}`).join(", ")],
            ["Total size", sum.files ? formatBytes(sum.bytes) : "—"],
            [
              "Modified",
              times.length
                ? `${fmtDateTime(times[0])} – ${fmtDateTime(times[times.length - 1])}`
                : "—",
            ],
          ]}
        />
      </Section>
      <Section title="Common tags">
        <TagEditor refs={refs} tags={common} addLabel="+ add to all" />
      </Section>
      <Section title="Bulk actions">
        <div className="flex flex-col gap-1.5">
          <Button
            size="sm"
            variant="outline"
            className="justify-start"
            onClick={() => runCommand("item.move")}
          >
            <HugeiconsIcon icon={FolderTransferIcon} strokeWidth={2} />
            Move to…
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="justify-start"
            onClick={() => runCommand("item.duplicate")}
          >
            <HugeiconsIcon icon={Copy01Icon} strokeWidth={2} />
            Duplicate
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="justify-start"
            onClick={() => runCommand("item.download")}
          >
            <HugeiconsIcon icon={Download01Icon} strokeWidth={2} />
            Download as .zip
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="justify-start text-destructive hover:text-destructive"
            onClick={() => runCommand("item.trash")}
          >
            <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} />
            Move to Trash
          </Button>
        </div>
      </Section>
    </div>
  );
}

function FolderSummary({
  folder,
  folderId,
  items,
}: {
  folder: FolderMeta | null;
  folderId: string | null;
  items: ExplorerItem[];
}) {
  const sum = summarize(items);
  const ref: ItemRef | null = folderId ? { type: "folder", id: folderId } : null;
  return (
    <div className="pb-4">
      <h3 className="font-brand text-xl leading-tight">{folder?.name ?? "Home"}</h3>
      <Section title="Summary">
        <PropertyList
          rows={[
            ["Folders", String(sum.folders)],
            ["Files", String(sum.files)],
            ["Size", formatBytes(sum.bytes)],
            ...(folder
              ? ([
                  ["Modified", fmtDateTime(folder.updatedAt)],
                  ["Created", fmtDateTime(folder.createdAt)],
                ] as Array<[string, string]>)
              : []),
          ]}
        />
      </Section>
      {folder && ref ? (
        <>
          <Section title="Tags">
            <TagEditor refs={[ref]} tags={folder.tags} />
          </Section>
          <ShareLinks itemRef={ref} />
        </>
      ) : (
        <p className="mt-3 text-xs text-muted-foreground">Select an item to see its details.</p>
      )}
    </div>
  );
}
