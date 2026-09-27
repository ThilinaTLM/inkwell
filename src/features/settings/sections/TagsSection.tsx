// Settings → Tags: every tag with its usage counts; rename inline (F2 /
// click), delete (confirm — removes the tag from every item). Colours are
// a deterministic hash of the name (no server-side colours).

import { Delete02Icon, Edit02Icon, LinkSquare02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { tagColor } from "@/components/shell/tagColor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useDeleteTag, useRenameTag, useTags } from "@/data/tags";
import { confirmDialog } from "@/features/dialogs/dialogStore";
import type { Tag } from "@/lib/api/client";
import { errorMessage } from "@/lib/errors";
import { SettingsGroup } from "../controls";

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;

export function TagsSection({ query }: { query: string }) {
  const tags = useTags();
  const rename = useRenameTag();
  const del = useDeleteTag();
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  const needle = query.trim().toLowerCase();
  const list = (tags.data ?? [])
    .filter((t) => !needle || t.name.toLowerCase().includes(needle))
    .sort(
      (a, b) =>
        b.fileCount + b.folderCount - (a.fileCount + a.folderCount) || a.name.localeCompare(b.name),
    );

  async function commit(t: Tag) {
    const name = draft.trim();
    setEditing(null);
    if (!name || name === t.name) return;
    try {
      await rename.mutateAsync({ id: t.id, name });
      toast.success(`Renamed #${t.name} to #${name}`);
    } catch (e) {
      toast.error(errorMessage(e, "could not rename tag"));
    }
  }

  async function remove(t: Tag) {
    const uses = t.fileCount + t.folderCount;
    const ok = await confirmDialog({
      title: `Delete tag #${t.name}?`,
      description: uses
        ? `It is removed from ${plural(uses, "item")}. The items themselves are kept.`
        : "The tag isn't used by any item.",
      confirmLabel: "Delete tag",
    });
    if (!ok) return;
    try {
      await del.mutateAsync(t.id);
      toast.success(`Deleted #${t.name}`);
    } catch (e) {
      toast.error(errorMessage(e, "could not delete tag"));
    }
  }

  return (
    <SettingsGroup
      title={`All tags${tags.data ? ` · ${tags.data.length}` : ""}`}
      description="Sorted by usage. Renaming updates every file and folder that uses the tag."
    >
      {tags.isPending ? <p className="py-4 text-xs text-muted-foreground">Loading…</p> : null}
      {!tags.isPending && list.length === 0 ? (
        <p className="py-6 text-center font-hand text-xl text-muted-foreground">
          {needle ? "No tags match." : "No tags yet — press T on any item."}
        </p>
      ) : null}
      <ul>
        {list.map((t) => (
          <li
            key={t.id}
            className="group/tag grid grid-cols-[1fr_auto] items-center gap-3 border-t border-border py-1.5 first:border-t-0 sm:grid-cols-[1fr_180px_auto]"
          >
            <div className="flex min-w-0 items-center gap-2">
              <span
                className="size-2.5 shrink-0 rounded-full"
                style={{ background: tagColor(t.name) }}
              />
              {editing === t.id ? (
                <Input
                  autoFocus
                  aria-label={`Rename tag ${t.name}`}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onBlur={() => void commit(t)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void commit(t);
                    if (e.key === "Escape") {
                      e.stopPropagation();
                      setEditing(null);
                    }
                  }}
                  className="h-7 max-w-[260px] text-[13px]"
                />
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setDraft(t.name);
                    setEditing(t.id);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "F2") {
                      setDraft(t.name);
                      setEditing(t.id);
                    }
                  }}
                  title="Rename"
                  className="truncate rounded text-left text-[13px] font-medium outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring/40"
                >
                  {t.name}
                </button>
              )}
            </div>
            <div className="hidden text-xs text-muted-foreground sm:block">
              {plural(t.fileCount, "file")} · {plural(t.folderCount, "folder")}
            </div>
            <div className="flex items-center gap-0.5 opacity-60 group-hover/tag:opacity-100 focus-within:opacity-100">
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Show items tagged ${t.name}`}
                title="Show items"
                nativeButton={false}
                render={<Link to={`/tags/${encodeURIComponent(t.name)}`} />}
              >
                <HugeiconsIcon icon={LinkSquare02Icon} strokeWidth={2} />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Rename tag ${t.name}`}
                title="Rename"
                onClick={() => {
                  setDraft(t.name);
                  setEditing(t.id);
                }}
              >
                <HugeiconsIcon icon={Edit02Icon} strokeWidth={2} />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Delete tag ${t.name}`}
                title="Delete"
                className="hover:text-destructive"
                onClick={() => void remove(t)}
              >
                <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} />
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </SettingsGroup>
  );
}
