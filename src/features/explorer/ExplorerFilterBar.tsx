// Explorer kind/tag filters. The persistent secondary filter bar was
// intentionally removed; these controls now live in a compact toolbar menu.

import { Cancel01Icon, FilterIcon, Tag01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { tagColor } from "@/components/shell/tagColor";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useTags } from "@/data/tags";
import type { FileKind } from "@/lib/api/client";
import { cn } from "@/lib/utils";
import { KIND_META, KIND_ORDER } from "./model";
import { ItemIcon } from "./views/ItemVisuals";

export interface ExplorerFilterProps {
  kinds: FileKind[];
  onKinds: (kinds: FileKind[]) => void;
  tag: string | null;
  onTag: (tag: string | null) => void;
}

/** Menu items shared by the desktop filter popover and the mobile More menu. */
export function ExplorerFilterMenuItems({ kinds, onKinds, tag, onTag }: ExplorerFilterProps) {
  const tags = useTags();
  const tagList = (tags.data ?? []).filter((item) => item.fileCount + item.folderCount > 0);

  return (
    <>
      <DropdownMenuLabel>File kind</DropdownMenuLabel>
      {KIND_ORDER.map((kind) => (
        <DropdownMenuCheckboxItem
          key={kind}
          checked={kinds.includes(kind)}
          onCheckedChange={(checked) =>
            onKinds(checked ? [...kinds, kind] : kinds.filter((item) => item !== kind))
          }
        >
          <ItemIcon kind={kind} className="size-3.5" />
          {KIND_META[kind].label}
        </DropdownMenuCheckboxItem>
      ))}
      <DropdownMenuSeparator />
      <DropdownMenuLabel>Tag</DropdownMenuLabel>
      <DropdownMenuRadioGroup value={tag ?? ""} onValueChange={(value) => onTag(value || null)}>
        <DropdownMenuRadioItem value="">
          <HugeiconsIcon icon={Tag01Icon} strokeWidth={2} />
          Any tag
        </DropdownMenuRadioItem>
        {tagList.map((item) => (
          <DropdownMenuRadioItem key={item.id} value={item.name}>
            <span
              className="size-2 rounded-full"
              style={{ background: tagColor(item.name) }}
              aria-hidden
            />
            {item.name}
            <span className="ml-auto text-muted-foreground">
              {item.fileCount + item.folderCount}
            </span>
          </DropdownMenuRadioItem>
        ))}
      </DropdownMenuRadioGroup>
      {kinds.length || tag ? (
        <>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => {
              onKinds([]);
              onTag(null);
            }}
          >
            <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} />
            Clear filters
          </DropdownMenuItem>
        </>
      ) : null}
    </>
  );
}

/** Compact trigger placed beside the folder text filter in the top toolbar. */
export function ExplorerFilterMenu(props: ExplorerFilterProps) {
  const activeCount = props.kinds.length + (props.tag ? 1 : 0);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="outline"
            size="sm"
            aria-label={activeCount ? `Filters, ${activeCount} active` : "Filters"}
            className={cn(
              "h-7 rounded-l-none border-l-0 px-2",
              activeCount && "bg-accent text-accent-foreground",
            )}
          />
        }
      >
        <HugeiconsIcon icon={FilterIcon} strokeWidth={2} className="size-3.5" />
        {activeCount ? (
          <span className="min-w-4 rounded-full bg-primary px-1 text-center text-[10px] leading-4 text-primary-foreground">
            {activeCount}
          </span>
        ) : null}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <ExplorerFilterMenuItems {...props} />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
