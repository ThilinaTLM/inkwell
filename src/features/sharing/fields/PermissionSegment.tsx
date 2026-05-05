// Two-button segmented control for a share's permission. Used by both
// the create and edit forms; the visual contract (border + active
// background, title + subtitle) must stay in sync between them so the
// two flows feel identical.

import type { SharePermission } from "@/lib/api/client";

export function PermissionSegment({
  value,
  onChange,
}: {
  value: SharePermission;
  onChange: (next: SharePermission) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <Segment
        active={value === "read"}
        onClick={() => onChange("read")}
        title="View only"
        subtitle="Read-only access."
      />
      <Segment
        active={value === "write"}
        onClick={() => onChange("write")}
        title="Can edit"
        subtitle="Read-write access."
      />
    </div>
  );
}

function Segment({
  active,
  onClick,
  title,
  subtitle,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  subtitle: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-active={active}
      className="rounded-md border border-border bg-background px-3 py-2.5 text-left transition-colors data-[active=true]:border-ring data-[active=true]:bg-accent data-[active=true]:text-accent-foreground hover:bg-accent/40"
    >
      <div className="text-sm font-medium">{title}</div>
      <div className="text-xs text-muted-foreground">{subtitle}</div>
    </button>
  );
}
