// Filter bar (wireframe `filterBar()`): kind chips, tag dropdown, sort
// label, thumbnail-size slider (grid only; ⌘+ / ⌘− also step it).

import { ArrowDown01Icon, GridIcon, Tag01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { FilterBar, FilterChip } from "@/components/shell/page";
import { tagColor } from "@/components/shell/tagColor";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useTags } from "@/data/tags";
import type { FileKind } from "@/lib/api/client";
import { THUMB_SIZES, useExplorerPref } from "@/lib/explorerPrefs";
import { SORT_LABELS } from "./ExplorerToolbar";
import { KIND_META, KIND_ORDER } from "./model";
import { ItemIcon } from "./views/ItemVisuals";

export function ExplorerFilterBar({
  kinds,
  onKinds,
  tag,
  onTag,
  showThumbSlider,
  sortLabel,
}: {
  kinds: FileKind[];
  onKinds: (k: FileKind[]) => void;
  tag: string | null;
  onTag: (t: string | null) => void;
  showThumbSlider: boolean;
  /** Overrides the pref-derived label (e.g. multi-column list sort). */
  sortLabel?: string;
}) {
  const tags = useTags();
  const [sort] = useExplorerPref("sort");
  const [foldersFirst] = useExplorerPref("foldersFirst");
  const [thumb, setThumb] = useExplorerPref("thumbSize");
  const tagList = (tags.data ?? []).filter((t) => t.fileCount + t.folderCount > 0);

  return (
    <FilterBar>
      <FilterChip active={kinds.length === 0} onClick={() => onKinds([])}>
        All kinds
      </FilterChip>
      {KIND_ORDER.map((k) => (
        <FilterChip
          key={k}
          active={kinds.includes(k)}
          icon={<ItemIcon kind={k} className="size-3.5" />}
          onClick={() => onKinds(kinds.includes(k) ? kinds.filter((x) => x !== k) : [...kinds, k])}
        >
          {KIND_META[k].label}
        </FilterChip>
      ))}
      <span aria-hidden className="mx-1 h-[18px] w-px shrink-0 bg-border" />
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <button
              type="button"
              aria-pressed={!!tag}
              className={`inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full border px-2.5 text-xs whitespace-nowrap ${
                tag
                  ? "border-primary/50 bg-accent text-accent-foreground"
                  : "border-border text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            />
          }
        >
          {tag ? (
            <span
              aria-hidden
              className="size-2 rounded-full"
              style={{ background: tagColor(tag) }}
            />
          ) : (
            <HugeiconsIcon icon={Tag01Icon} strokeWidth={2} className="size-3" />
          )}
          {tag ?? "Tag"}
          <HugeiconsIcon icon={ArrowDown01Icon} strokeWidth={2} className="size-3" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="max-h-80 min-w-48 overflow-y-auto">
          <DropdownMenuRadioGroup
            value={tag ?? ""}
            onValueChange={(v) => onTag((v as string) || null)}
          >
            <DropdownMenuRadioItem value="">Any tag</DropdownMenuRadioItem>
            {tagList.length ? <DropdownMenuSeparator /> : null}
            {tagList.map((t) => (
              <DropdownMenuRadioItem key={t.id} value={t.name}>
                <span
                  aria-hidden
                  className="size-2 rounded-full"
                  style={{ background: tagColor(t.name) }}
                />
                {t.name}
                <span className="ml-auto text-muted-foreground">{t.fileCount + t.folderCount}</span>
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      <div className="flex-1" />
      <span className="shrink-0 whitespace-nowrap">
        Sort:{" "}
        <b className="font-semibold text-foreground">
          {sortLabel ?? `${SORT_LABELS[sort.key]} ${sort.dir === "asc" ? "↑" : "↓"}`}
        </b>
        {foldersFirst ? " · folders first" : ""}
      </span>
      {showThumbSlider ? (
        <label
          className="ml-2.5 flex shrink-0 items-center gap-1.5"
          title="Thumbnail size (⌘+ / ⌘−)"
        >
          <HugeiconsIcon icon={GridIcon} strokeWidth={2} className="size-[11px]" />
          <input
            type="range"
            min={0}
            max={THUMB_SIZES.length - 1}
            step={1}
            value={Math.max(0, THUMB_SIZES.indexOf(thumb))}
            onChange={(e) => setThumb(THUMB_SIZES[Number(e.target.value)] ?? "m")}
            aria-label="Thumbnail size"
            className="h-1 w-[70px] accent-primary"
          />
          <HugeiconsIcon icon={GridIcon} strokeWidth={2} className="size-[15px]" />
        </label>
      ) : null}
    </FilterBar>
  );
}
