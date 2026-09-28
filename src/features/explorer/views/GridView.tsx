// Grid (icons) view — screen 01. Folders and files in separate
// auto-fill grids with "Folders · n" / "Files · n" headers; thumbnail
// size from the `thumbSize` pref (or prop). Arrow keys are 2-D aware
// (column count read from the computed grid template).

import { type CSSProperties, memo } from "react";
import { type ThumbSize, useExplorerPref } from "@/lib/explorerPrefs";
import { relTime } from "@/lib/format";
import { useSelectionCount } from "@/lib/selection";
import { cn } from "@/lib/utils";
import { type ExplorerItem, kindLabel } from "../model";
import type { NavLayout } from "../selection-logic";
import { Collection, type ExplorerViewProps, itemStateClass, useItemBindings } from "./collection";
import { ItemName, SelectCheck } from "./ItemName";
import { ItemBadges, ItemIcon, ItemThumb } from "./ItemVisuals";

export const THUMB_DIMENSIONS: Record<ThumbSize, { w: number; h: number }> = {
  s: { w: 124, h: 80 },
  m: { w: 168, h: 112 },
  l: { w: 220, h: 150 },
  xl: { w: 290, h: 200 },
};

export interface GridViewProps extends ExplorerViewProps {
  thumbSize?: ThumbSize;
  /** "Folders · n" / "Files · n" group headers (default true). */
  groupHeaders?: boolean;
  /** Secondary line under the name (default: item count / kind · modified). */
  meta?: (item: ExplorerItem) => string;
}

function gridLayout(container: HTMLElement): NavLayout {
  const sections = [...container.querySelectorAll<HTMLElement>("[data-grid-section]")].map(
    (el) => ({
      start: Number(el.dataset.start),
      count: Number(el.dataset.count),
      cols: Math.max(1, getComputedStyle(el).gridTemplateColumns.split(" ").filter(Boolean).length),
    }),
  );
  return { type: "grid", sections };
}

export function defaultMeta(item: ExplorerItem): string {
  if (item.type === "folder") {
    const n = item.itemCount ?? 0;
    return `${n} item${n === 1 ? "" : "s"}`;
  }
  return `${kindLabel(item.kind)} · ${relTime(item.updatedAt)}`;
}

export function GridView({ thumbSize, groupHeaders = true, meta, ...props }: GridViewProps) {
  const [prefSize] = useExplorerPref("thumbSize");
  const dims = THUMB_DIMENSIONS[thumbSize ?? prefSize] ?? THUMB_DIMENSIONS.m;
  const folders = props.items.filter((i) => i.type === "folder");
  const files = props.items.filter((i) => i.type === "file");
  // Items are in display order; keep groups contiguous even if the
  // caller interleaved them (foldersFirst off).
  const grouped = groupHeaders && folders.length > 0 && files.length > 0;
  const sections = grouped
    ? [
        { label: "Folders", items: folders, start: 0 },
        { label: "Files", items: files, start: folders.length },
      ]
    : [{ label: null, items: props.items, start: 0 }];
  const ordered = grouped ? [...folders, ...files] : props.items;
  const multi = useSelectionCount() > 1;

  return (
    <Collection
      {...props}
      items={ordered}
      layout={gridLayout}
      containerClassName="px-4 py-3.5"
      style={{ "--gw": `${dims.w}px`, "--gh": `${dims.h}px` } as CSSProperties}
    >
      {sections.map((s) => (
        <section key={s.label ?? "all"} className="mb-4 last:mb-0">
          {s.label ? (
            <h3 className="mx-0.5 mb-2.5 text-[11px] font-normal tracking-[0.08em] text-muted-foreground uppercase">
              {s.label} · {s.items.length}
            </h3>
          ) : null}
          <div
            data-grid-section=""
            data-start={s.start}
            data-count={s.items.length}
            className="grid gap-3.5 [grid-template-columns:repeat(auto-fill,minmax(var(--gw),1fr))]"
          >
            {s.items.map((item) => (
              <GridItem
                key={item.key}
                item={item}
                meta={meta ?? defaultMeta}
                selectionMode={multi}
              />
            ))}
          </div>
        </section>
      ))}
    </Collection>
  );
}

const GridItem = memo(function GridItem({
  item,
  meta,
  selectionMode,
}: {
  item: ExplorerItem;
  meta: (i: ExplorerItem) => string;
  selectionMode: boolean;
}) {
  const { props, state, toggle, onRenameDone } = useItemBindings(item);
  return (
    <div
      {...props}
      className={cn(
        "group/item relative min-w-0 cursor-default rounded-[10px] border border-transparent p-2 transition-colors",
        itemStateClass(state),
      )}
    >
      <ItemThumb
        item={item}
        className={cn("h-[var(--gh)] w-full", item.type === "folder" && "text-muted-foreground")}
      />
      <SelectCheck
        checked={state.selected}
        onToggle={toggle}
        className={cn(
          "absolute top-3.5 left-3.5 shadow-sm",
          !state.selected && "bg-background/80",
          state.selected || selectionMode ? "flex" : "hidden group-hover/item:flex",
        )}
      />
      <ItemBadges item={item} />
      <div className="mt-2 flex min-w-0 items-center gap-1.5 text-[12.5px] font-semibold text-foreground">
        <ItemIcon kind={item.kind} />
        <ItemName item={item} state={state} onRenameDone={onRenameDone} />
      </div>
      <div className="mt-px truncate pl-6 text-[11px] text-muted-foreground">{meta(item)}</div>
    </div>
  );
});
