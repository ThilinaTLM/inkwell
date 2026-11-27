import { cn } from "@/lib/utils";
import { PROJECT_STATUS_META, type ProjectStatus } from "./projectStyle";

/**
 * Paused (amber) · Done (grey). Active is the default state, so it renders
 * nothing — only non-default statuses are worth calling out.
 */
export function StatusPill({
  status,
  className,
}: {
  status: ProjectStatus | null | undefined;
  className?: string;
}) {
  if (status !== "paused" && status !== "done") return null;
  const meta = PROJECT_STATUS_META[status];
  return (
    <span
      className={cn(
        "inline-flex h-5 items-center rounded-full px-2 text-[11px] font-medium",
        meta.className,
        className,
      )}
    >
      {meta.label}
    </span>
  );
}
