import { Checkbox } from "@/components/ui/checkbox";
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
    <Checkbox
      tabIndex={-1}
      checked={checked}
      aria-label={checked ? "Deselect" : "Select"}
      data-item-check=""
      onCheckedChange={onToggle}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
      className={className}
    />
  );
}
