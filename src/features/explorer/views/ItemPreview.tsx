// Preview block (large thumbnail, name, properties) shared by the
// Columns view preview column and the details panel.

import type { ReactNode } from "react";
import { useFolders } from "@/data/folders";
import { folderPathLabel } from "@/features/actions/itemCache";
import { fmtDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { type ExplorerItem, formatBytes, kindLabel } from "../model";
import { ItemIcon, ItemThumb, TagPill } from "./ItemVisuals";

export function PropertyList({
  rows,
  className,
}: {
  rows: Array<[string, ReactNode]>;
  className?: string;
}) {
  return (
    <dl className={cn("grid grid-cols-[86px_1fr] gap-x-2 gap-y-1.5 text-xs", className)}>
      {rows.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-muted-foreground/80">{k}</dt>
          <dd className="min-w-0 break-words text-muted-foreground">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

export function itemSubtitle(item: ExplorerItem): string {
  if (item.type === "folder") {
    const n = item.itemCount ?? 0;
    return `Folder · ${n} item${n === 1 ? "" : "s"}`;
  }
  return `${kindLabel(item.kind)} · ${formatBytes(item.sizeBytes ?? 0)}`;
}

export function ItemPreview({ item, withTags = true }: { item: ExplorerItem; withTags?: boolean }) {
  const folders = useFolders();
  const location = folders.data ? folderPathLabel(folders.data, item.parentId) : "…";
  const rows: Array<[string, ReactNode]> = [
    ["Location", location],
    ["Modified", fmtDateTime(item.updatedAt)],
    ["Created", fmtDateTime(item.createdAt)],
  ];
  if (item.file) rows.push(["Version", `v${item.file.version}`]);
  if (withTags)
    rows.push([
      "Tags",
      item.tags.length ? (
        <span key="tags" className="flex flex-wrap gap-1">
          {item.tags.map((t) => (
            <TagPill key={t} tag={t} />
          ))}
        </span>
      ) : (
        "—"
      ),
    ]);
  return (
    <div>
      <ItemThumb item={item} large className="h-[190px] w-full" />
      <h3 className="mt-3 flex min-w-0 items-center gap-2 text-[15px] font-semibold text-foreground">
        <ItemIcon kind={item.kind} />
        <span className="truncate" title={item.name}>
          {item.name}
        </span>
      </h3>
      <div className="mb-3 text-xs text-muted-foreground">{itemSubtitle(item)}</div>
      <PropertyList rows={rows} />
    </div>
  );
}
