import { GridViewIcon, LeftToRightListBulletIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { type CollectionLayout, useCollectionLayout } from "@/lib/explorerPrefs";
import { cn } from "@/lib/utils";

const OPTIONS: Array<{ id: CollectionLayout; label: string; icon: typeof GridViewIcon }> = [
  { id: "cards", label: "Cards", icon: GridViewIcon },
  { id: "list", label: "List", icon: LeftToRightListBulletIcon },
];

/** Cards / List segmented control; the choice is stored per device. */
export function LayoutToggle({ className }: { className?: string }) {
  const [layout, setLayout] = useCollectionLayout();
  return (
    <div
      role="radiogroup"
      aria-label="Layout"
      className={cn("inline-flex rounded-[10px] border border-border bg-card p-0.5", className)}
    >
      {OPTIONS.map((o) => (
        // biome-ignore lint/a11y/useSemanticElements: segmented control built from buttons
        <button
          key={o.id}
          type="button"
          role="radio"
          aria-checked={layout === o.id}
          aria-label={o.label}
          title={o.label}
          onClick={() => setLayout(o.id)}
          className={cn(
            "grid h-7 w-8 place-items-center rounded-lg text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40",
            layout === o.id && "bg-accent text-foreground",
          )}
        >
          <HugeiconsIcon icon={o.icon} strokeWidth={1.8} className="size-4" />
        </button>
      ))}
    </div>
  );
}
