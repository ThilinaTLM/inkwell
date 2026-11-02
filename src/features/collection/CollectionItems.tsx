// Presentational pieces of <ItemCollection>: folder card, file card, list row,
// hover quick actions. All interaction goes through the `ItemHandlers` bag.

import { MoreHorizontalIcon, Share08Icon, StarIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { type MouseEvent, memo, type PointerEvent, type ReactNode } from "react";
import { ProjectIcon } from "@/components/project/ProjectIcon";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { itemActions } from "@/features/actions/useItemActions";
import { useIsDragSource } from "@/features/explorer/dnd/itemDnd";
import { CommandMenuItems } from "@/lib/commands/CommandMenuItems";
import { relTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { CollectionPreview, KindIcon } from "./CollectionPreview";
import { COLLECTION_MENU_IDS } from "./menus";
import { type CollectionItem, formatBytes, kindLabel } from "./model";

export interface ItemHandlers {
  onItemClick(item: CollectionItem, e: MouseEvent): void;
  onItemDoubleClick(item: CollectionItem): void;
  onItemAuxClick(item: CollectionItem, e: MouseEvent): void;
  onItemPointerDown(e: PointerEvent): void;
  onItemDragStart(item: CollectionItem, e: React.DragEvent): void;
}

interface ItemProps {
  item: CollectionItem;
  selected: boolean;
  tabbable: boolean;
  handlers: ItemHandlers;
  location?: string;
}

const base =
  "group/item relative outline-none transition-[box-shadow,background-color,border-color] focus-visible:ring-2 focus-visible:ring-ring/50 data-[drop-over=true]:border-primary data-[drop-over=true]:bg-accent-soft data-[drop-over=true]:ring-2 data-[drop-over=true]:ring-primary/40";

function useItemProps(
  { item, selected, tabbable, handlers }: ItemProps,
  extra: { draggable?: boolean } = {},
) {
  const dragging = useIsDragSource(item.key);
  return {
    role: "option" as const,
    "aria-selected": selected,
    "aria-label": item.name,
    "data-item-key": item.key,
    "data-selected": selected,
    "data-dragging": dragging,
    tabIndex: tabbable ? 0 : -1,
    draggable: extra.draggable ?? true,
    onClick: (e: MouseEvent) => handlers.onItemClick(item, e),
    onDoubleClick: () => handlers.onItemDoubleClick(item),
    onAuxClick: (e: MouseEvent) => handlers.onItemAuxClick(item, e),
    onPointerDown: handlers.onItemPointerDown,
    onDragStart: (e: React.DragEvent) => handlers.onItemDragStart(item, e),
    // Folders accept drops (items moved into them).
    "data-drop-folder": item.type === "folder" ? item.id : undefined,
  };
}

function stop(e: { stopPropagation(): void }) {
  e.stopPropagation();
}

// ─── Hover quick actions ────────────────────────────────────────────────

function QuickBtn({
  label,
  onClick,
  active,
  children,
}: {
  label: string;
  onClick: () => void;
  active?: boolean;
  children: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={label}
            aria-pressed={active}
            onClick={(e) => {
              e.stopPropagation();
              onClick();
            }}
            onDoubleClick={stop}
            onPointerDown={stop}
            className={cn("size-6 rounded-md", active && "text-primary")}
          />
        }
      >
        {children}
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

export function QuickActions({ item, className }: { item: CollectionItem; className?: string }) {
  const ref = item.ref;
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: swallows bubbling events so quick actions don't select/open the item
    // biome-ignore lint/a11y/useKeyWithClickEvents: wrapper only stops propagation; its buttons are keyboard accessible
    <div
      onClick={stop}
      onDoubleClick={stop}
      onPointerDown={stop}
      onContextMenu={stop}
      className={cn(
        "flex gap-0.5 rounded-[10px] border border-input bg-card p-[3px] opacity-0 shadow-card transition-opacity group-focus-within/item:opacity-100 group-hover/item:opacity-100 has-[[aria-expanded=true]]:opacity-100 [@media(hover:none)_and_(pointer:coarse)]:opacity-100",
        className,
      )}
    >
      <QuickBtn
        label={item.starred ? "Remove from Starred" : "Add to Starred"}
        active={item.starred}
        onClick={() => void itemActions.toggleStar([ref])}
      >
        <HugeiconsIcon
          icon={StarIcon}
          strokeWidth={1.8}
          className={cn("size-3.5", item.starred && "fill-current")}
        />
      </QuickBtn>
      <QuickBtn label="Share…" onClick={() => itemActions.share(ref)}>
        <HugeiconsIcon icon={Share08Icon} strokeWidth={1.8} className="size-3.5" />
      </QuickBtn>
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label={`More actions for ${item.name}`}
          className="grid size-6 place-items-center rounded-md text-foreground outline-none transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/40 aria-expanded:bg-accent"
        >
          <HugeiconsIcon icon={MoreHorizontalIcon} strokeWidth={1.8} className="size-3.5" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <CommandMenuItems
            ids={COLLECTION_MENU_IDS}
            as="dropdown"
            ctx={{ selection: [ref], focused: ref }}
          />
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function StarBadge({ item }: { item: CollectionItem }) {
  if (!item.starred) return null;
  return (
    <HugeiconsIcon
      icon={StarIcon}
      strokeWidth={1.8}
      aria-label="Starred"
      className="size-3.5 shrink-0 fill-primary text-primary"
    />
  );
}

// ─── Cards ──────────────────────────────────────────────────────────────

export const FolderCard = memo(function FolderCard(props: ItemProps) {
  const { item, selected } = props;
  const p = useItemProps(props);
  const n = item.itemCount ?? 0;
  return (
    <div
      {...p}
      className={cn(
        base,
        "flex items-center gap-3 rounded-xl border bg-card px-3 py-2.5 shadow-card data-[dragging=true]:opacity-50",
        selected ? "border-primary ring-1 ring-primary/50" : "border-border hover:border-input",
      )}
    >
      <ProjectIcon folder={item.project} size="md" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-[13.5px] font-medium text-foreground">{item.name}</span>
          <StarBadge item={item} />
        </div>
        <div className="truncate text-xs text-muted-foreground">
          {n} {n === 1 ? "item" : "items"}
          {props.location ? ` · ${props.location}` : ""}
        </div>
      </div>
      <QuickActions item={item} className="absolute top-1.5 right-1.5" />
    </div>
  );
});

export const FileCard = memo(function FileCard(props: ItemProps) {
  const { item, selected } = props;
  const p = useItemProps(props);
  return (
    <div
      {...p}
      className={cn(
        base,
        "flex flex-col overflow-hidden rounded-xl border bg-card shadow-card data-[dragging=true]:opacity-50",
        selected ? "border-primary ring-1 ring-primary/50" : "border-border hover:border-input",
      )}
    >
      <CollectionPreview item={item} className="aspect-[16/10] border-b border-border" />
      <div className="flex min-w-0 flex-col gap-0.5 px-3 pt-2.5 pb-3">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-[13.5px] font-medium text-foreground">{item.name}</span>
          <StarBadge item={item} />
        </div>
        <div className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
          <KindIcon item={item} className="size-3.5 shrink-0" />
          <span className="truncate">
            {kindLabel(item.kind)} · {relTime(item.updatedAt)}
            {props.location ? ` · ${props.location}` : ""}
          </span>
        </div>
      </div>
      <QuickActions item={item} className="absolute top-2 right-2" />
    </div>
  );
});

// ─── List row ───────────────────────────────────────────────────────────

export const LIST_COLS = {
  withLocation:
    "grid-cols-[minmax(0,1fr)_auto] md:grid-cols-[minmax(0,1fr)_96px_minmax(0,180px)_104px_80px]",
  plain: "grid-cols-[minmax(0,1fr)_auto] md:grid-cols-[minmax(0,1fr)_96px_104px_80px]",
};

export const ListRow = memo(function ListRow(props: ItemProps & { withLocation: boolean }) {
  const { item, selected, withLocation } = props;
  const p = useItemProps(props);
  return (
    <div
      {...p}
      className={cn(
        base,
        "grid min-h-12 items-center gap-3 border-b border-border px-3 py-1.5 text-[13px] last:border-b-0 data-[dragging=true]:opacity-50",
        withLocation ? LIST_COLS.withLocation : LIST_COLS.plain,
        selected ? "bg-accent-soft" : "hover:bg-accent/60",
      )}
    >
      <div className="flex min-w-0 items-center gap-3">
        {item.type === "folder" ? (
          <ProjectIcon folder={item.project} size="sm" />
        ) : (
          <span className="grid size-6 shrink-0 place-items-center rounded-md bg-surface-2">
            <KindIcon item={item} className="size-4" />
          </span>
        )}
        <span className="truncate font-medium text-foreground">{item.name}</span>
        <StarBadge item={item} />
      </div>
      <span className="hidden text-muted-foreground md:block">{kindLabel(item.kind)}</span>
      {withLocation ? (
        <span className="hidden truncate text-muted-foreground md:block">
          {props.location ?? ""}
        </span>
      ) : null}
      <span className="text-right text-xs text-muted-foreground md:text-left md:text-[13px]">
        {relTime(item.updatedAt)}
      </span>
      <span className="hidden text-muted-foreground tabular-nums md:block">
        {item.type === "folder" ? `${item.itemCount ?? 0} items` : formatBytes(item.sizeBytes ?? 0)}
      </span>
      <QuickActions
        item={item}
        className="absolute top-1/2 right-2 -translate-y-1/2 max-md:hidden"
      />
    </div>
  );
});
