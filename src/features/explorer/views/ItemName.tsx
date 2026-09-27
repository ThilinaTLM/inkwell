import { InlineRename } from "../InlineRename";
import type { ExplorerItem } from "../model";
import type { ItemState } from "./collection";

/** Item name (or the inline rename field while renaming). The
 *  `data-item-name` marker enables slow-second-click rename. */
export function ItemName({
  item,
  state,
  onRenameDone,
  className,
}: {
  item: ExplorerItem;
  state: ItemState;
  onRenameDone: (advance: 0 | 1 | -1) => void;
  className?: string;
}) {
  if (state.renaming) {
    return <InlineRename itemRef={item.ref} name={item.name} onDone={onRenameDone} />;
  }
  return (
    <span data-item-name="" className={className ?? "min-w-0 truncate"}>
      {item.name}
    </span>
  );
}

export function SelectCheck({
  checked,
  onToggle,
  className,
}: {
  checked: boolean;
  onToggle: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      tabIndex={-1}
      aria-pressed={checked}
      aria-label={checked ? "Deselect" : "Select"}
      data-item-check=""
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      className={
        className ??
        `grid size-[15px] shrink-0 place-items-center rounded-[4px] border-[1.5px] text-[10px] leading-none font-black ${
          checked
            ? "border-primary bg-primary text-primary-foreground"
            : "border-muted-foreground/40 bg-transparent"
        }`
      }
    >
      {checked ? "✓" : ""}
    </button>
  );
}
