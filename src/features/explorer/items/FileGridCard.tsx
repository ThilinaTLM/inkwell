// FileGridCard — a file tile in the grid layout.
//
// Structure: a 16:10 thumbnail band (the saved SVG preview, or a
// kind-tinted placeholder with the brand mark) above a two-line meta
// block — name, then kind + relative update time. A share indicator and
// the "…" overflow menu float over the thumbnail.
//
// The tile is a focusable article carrying `data-explorer-item` /
// `data-explorer-id` so `useExplorerHotkeys` can act on whatever is
// focused without a selection registry.

import { Share08Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import { FileKindGlyph } from "@/components/file-kinds/file-kind-icons";
import type { FileMeta } from "@/lib/api/client";
import { fileKindInfo } from "@/lib/file-kinds";
import { relTime } from "@/lib/format";
import { cn } from "@/lib/utils";

import type { ItemMenuActions } from "../ItemContextMenu";
import { ItemMenu } from "./ItemMenu";
import { TagDots } from "./TagChips";

export function FileGridCard({
  file,
  actions,
  folderName,
}: {
  file: FileMeta;
  actions: ItemMenuActions;
  /** Shown instead of the kind label in global views. */
  folderName?: string | null;
}) {
  const info = fileKindInfo(file.kind);
  return (
    // biome-ignore lint/a11y/useSemanticElements: a button element cannot contain the nested overflow menu and tag links this tile needs
    <div
      role="button"
      aria-label={file.name}
      data-explorer-item="file"
      data-explorer-id={file.id}
      tabIndex={0}
      onClick={() => actions.openFile(file)}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          actions.openFile(file);
        }
      }}
      title={file.name}
      className={cn(
        "group relative flex cursor-pointer flex-col overflow-hidden rounded-lg border border-border bg-card text-left transition-colors",
        "hover:border-ring/40 hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
      )}
    >
      {/* Thumbnail band */}
      <div className="relative aspect-[16/10] w-full overflow-hidden border-b border-border bg-muted/40">
        {file.hasThumb ? (
          <img
            src={`/api/files/${file.id}/thumb?v=${file.thumbUpdatedAt}`}
            alt=""
            loading="lazy"
            className="ink-thumb-img size-full object-cover"
          />
        ) : (
          <div className={cn("grid size-full place-items-center", info.tintClass)}>
            <FileKindGlyph kind={file.kind} className="size-7 opacity-90" />
          </div>
        )}

        <div className="absolute right-1 top-1 flex items-center gap-1 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100 group-focus-visible:opacity-100">
          <ItemMenu
            target={{ kind: "file", file }}
            actions={actions}
            className="bg-card/90 backdrop-blur"
          />
        </div>

        {file.activeShareCount > 0 ? (
          <span
            title={`${file.activeShareCount} active share link${file.activeShareCount === 1 ? "" : "s"}`}
            className="absolute left-1 top-1 inline-flex items-center gap-1 rounded-full bg-card/90 px-1.5 py-0.5 text-[0.625rem] font-medium text-muted-foreground ring-1 ring-border backdrop-blur"
          >
            <HugeiconsIcon icon={Share08Icon} strokeWidth={2} className="size-2.5" />
            {file.activeShareCount}
          </span>
        ) : null}
      </div>

      {/* Meta */}
      <div className="flex min-w-0 flex-col gap-0.5 px-2.5 py-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <FileKindGlyph kind={file.kind} className="size-3.5 shrink-0" />
          <span className="min-w-0 flex-1 truncate text-xs font-medium text-foreground">
            {file.name}
          </span>
          <TagDots tags={file.tags} />
        </div>
        <span className="truncate text-[0.6875rem] text-muted-foreground">
          {folderName ? `${folderName} · ` : ""}
          {relTime(file.updatedAt)}
        </span>
      </div>
    </div>
  );
}
