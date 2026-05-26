// Two-button segmented control for a share's permission. Used by both
// the create and edit forms; the visual contract (border + active
// background, title + subtitle) must stay in sync between them so the
// two flows feel identical.
//
// `lockedToRead` is a kind-aware lock: when true, the "Can edit"
// segment is disabled (and the wrapping form is responsible for
// forcing `value` to "read" so a click can't desync state). Used
// today for static-site shares, which have no write path on the
// share-token side.

import type { SharePermission } from "@/lib/api/client";

export function PermissionSegment({
  value,
  onChange,
  lockedToRead = false,
  lockedReason,
}: {
  value: SharePermission;
  onChange: (next: SharePermission) => void;
  lockedToRead?: boolean;
  /** Short explanation shown under the segments when locked. */
  lockedReason?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="grid grid-cols-2 gap-2">
        <Segment
          active={value === "read"}
          onClick={() => onChange("read")}
          title="View only"
          subtitle="Read-only access."
        />
        <Segment
          active={value === "write"}
          onClick={() => {
            if (!lockedToRead) onChange("write");
          }}
          title="Can edit"
          subtitle="Read-write access."
          disabled={lockedToRead}
        />
      </div>
      {lockedToRead ? (
        <p className="text-xs text-muted-foreground">
          {lockedReason ?? "Static sites can only be shared view-only."}
        </p>
      ) : null}
    </div>
  );
}

function Segment({
  active,
  onClick,
  title,
  subtitle,
  disabled = false,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  subtitle: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-active={active}
      disabled={disabled}
      aria-disabled={disabled}
      className="rounded-md border border-border bg-background px-3 py-2.5 text-left transition-colors data-[active=true]:border-ring data-[active=true]:bg-accent data-[active=true]:text-accent-foreground hover:bg-accent/40 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-background"
    >
      <div className="text-sm font-medium">{title}</div>
      <div className="text-xs text-muted-foreground">{subtitle}</div>
    </button>
  );
}
