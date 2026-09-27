// Compact view — screen 02. Icon + name in 30 px rows flowing top to
// bottom into as many columns as needed (horizontal scroll). The row
// count adapts to the pane height; ←/→ jump a whole column.

import { memo, useLayoutEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import type { ExplorerItem } from "../model";
import type { NavLayout } from "../selection-logic";
import { Collection, type ExplorerViewProps, itemStateClass, useItemBindings } from "./collection";
import { ItemName } from "./ItemName";
import { ItemIcon, StarMark } from "./ItemVisuals";

const ROW = 30;
const GAP = 2;

export function CompactView(props: ExplorerViewProps) {
  const [rows, setRows] = useState(12);
  const effectiveRows = Math.min(rows, Math.max(1, props.items.length));
  const rowsRef = useRef(effectiveRows);
  rowsRef.current = effectiveRows;
  const probe = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const host = probe.current?.parentElement;
    if (!host) return;
    const measure = () => {
      // container padding (py-3.5 = 14px * 2) + room for a horizontal scrollbar
      const h = host.clientHeight - 28 - 12;
      setRows(Math.max(1, Math.floor((h + GAP) / (ROW + GAP))));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(host);
    return () => ro.disconnect();
  }, []);

  const layout = (): NavLayout => ({ type: "flow", rows: rowsRef.current });

  return (
    <Collection {...props} layout={layout} containerClassName="px-4 py-3.5">
      <div
        ref={probe}
        className="grid w-max grid-flow-col gap-x-3.5 gap-y-0.5"
        style={{
          gridTemplateRows: `repeat(${effectiveRows}, ${ROW}px)`,
          gridAutoColumns: "minmax(230px, 260px)",
        }}
      >
        {props.items.map((item) => (
          <CompactItem key={item.key} item={item} />
        ))}
      </div>
    </Collection>
  );
}

const CompactItem = memo(function CompactItem({ item }: { item: ExplorerItem }) {
  const { props, state, onRenameDone } = useItemBindings(item);
  return (
    <div
      {...props}
      className={cn(
        "flex h-[30px] min-w-0 cursor-default items-center gap-2 rounded-md border border-transparent px-2 text-[12.5px] font-medium text-foreground",
        itemStateClass(state),
      )}
    >
      <ItemIcon kind={item.kind} />
      <ItemName item={item} state={state} onRenameDone={onRenameDone} />
      {item.starred ? <StarMark /> : null}
      {item.type === "folder" ? (
        <span className="ml-auto shrink-0 text-[11px] text-muted-foreground">
          {item.itemCount ?? 0}
        </span>
      ) : null}
    </div>
  );
});
