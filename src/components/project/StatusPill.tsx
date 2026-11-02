import { cn } from "@/lib/utils";
import { PROJECT_STATUS_META, type ProjectStatus } from "./projectStyle";

/** Active (green) · Paused (amber) · Done (grey). `null` renders as Active. */
export function StatusPill({
  status,
  className,
}: {
  status: ProjectStatus | null | undefined;
  className?: string;
}) {
  const meta = PROJECT_STATUS_META[status ?? "active"];
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
