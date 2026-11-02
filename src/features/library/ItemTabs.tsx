// Files hub tabs backed by <ItemCollection>: All · Recent · Starred.

import { File01Icon, Search01Icon, StarIcon, Time04Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useMemo, useState } from "react";
import { EmptyState } from "@/components/EmptyState";
import { useFiles } from "@/data/files";
import { useFolders } from "@/data/folders";
import {
  type CollectionItem,
  ItemCollection,
  kindLabel,
  toCollectionItems,
} from "@/features/collection";
import { formatBytes } from "@/features/collection/model";
import { FilesSearch } from "./FilesSearch";

function matches(item: CollectionItem, q: string): boolean {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  const hay = `${item.name} ${item.tags.join(" ")} ${kindLabel(item.kind)}`.toLowerCase();
  return needle.split(/\s+/).every((w) => hay.includes(w.replace(/^#/, "")));
}

function Quiet({ icon, title, body }: { icon: typeof File01Icon; title: string; body: string }) {
  return (
    <EmptyState
      title={title}
      body={body}
      icon={<HugeiconsIcon icon={icon} strokeWidth={1.4} className="size-9" />}
    />
  );
}

function NoMatches() {
  return (
    <Quiet
      icon={Search01Icon}
      title="No matches"
      body="Nothing matches that filter. Try a shorter search."
    />
  );
}

export function AllFilesTab() {
  const files = useFiles({});
  const [q, setQ] = useState("");
  const all = useMemo(() => toCollectionItems([], files.data ?? []), [files.data]);
  const items = useMemo(() => all.filter((i) => matches(i, q)), [all, q]);
  const total = useMemo(
    () => (files.data ?? []).reduce((n, f) => n + (f.sizeBytes ?? 0), 0),
    [files.data],
  );
  const count = files.data?.length ?? 0;
  return (
    <>
      <ItemCollection
        items={items}
        loading={files.isPending}
        layout="list"
        layoutToggle={false}
        filterChips
        showLocation
        scope="files"
        ariaLabel="All files"
        toolbarEnd={<FilesSearch value={q} onChange={setQ} placeholder="Filter files" />}
        empty={
          q ? (
            <NoMatches />
          ) : (
            <Quiet
              icon={File01Icon}
              title="No files yet"
              body="Files you create or upload appear here."
            />
          )
        }
      />
      {files.data ? (
        <p className="mt-4 text-xs text-muted-foreground">
          {count} {count === 1 ? "file" : "files"} · {formatBytes(total)} used
        </p>
      ) : null}
    </>
  );
}

export function RecentFilesTab() {
  const files = useFiles({});
  const [q, setQ] = useState("");
  const items = useMemo(() => {
    const recent = (files.data ?? [])
      .slice()
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, 50);
    return toCollectionItems([], recent).filter((i) => matches(i, q));
  }, [files.data, q]);
  return (
    <ItemCollection
      items={items}
      loading={files.isPending}
      sort={false}
      filterChips
      showLocation
      scope="files-recent"
      ariaLabel="Recently edited files"
      toolbarEnd={<FilesSearch value={q} onChange={setQ} placeholder="Filter recent" />}
      empty={
        q ? (
          <NoMatches />
        ) : (
          <Quiet
            icon={Time04Icon}
            title="Nothing recent"
            body="Files you edit show up here, newest first."
          />
        )
      }
    />
  );
}

export function StarredTab() {
  const files = useFiles({ starred: true });
  const folders = useFolders();
  const [q, setQ] = useState("");
  const items = useMemo(() => {
    const starredFolders = (folders.data ?? []).filter((f) => !!f.starredAt);
    return toCollectionItems(starredFolders, files.data ?? []).filter((i) => matches(i, q));
  }, [files.data, folders.data, q]);
  return (
    <ItemCollection
      items={items}
      loading={files.isPending || folders.isPending}
      filterChips
      showLocation
      scope="files-starred"
      ariaLabel="Starred items"
      toolbarEnd={<FilesSearch value={q} onChange={setQ} placeholder="Filter starred" />}
      empty={
        q ? (
          <NoMatches />
        ) : (
          <Quiet
            icon={StarIcon}
            title="Nothing starred"
            body="Star files and folders to keep them one click away. Press S on a selected item."
          />
        )
      }
    />
  );
}
