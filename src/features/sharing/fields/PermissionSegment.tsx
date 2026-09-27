// "View only | Can edit" segmented control for a share link.
// `lockedToRead` disables "Can edit" (static sites have no write path on
// the share-token side); the caller keeps `value` at "read" in that case.

import { Segmented } from "@/features/settings/controls";
import type { SharePermission } from "@/lib/api/client";

export function PermissionSegment({
  value,
  onChange,
  lockedToRead = false,
  lockedReason = "Static sites can only be shared view-only.",
}: {
  value: SharePermission;
  onChange: (next: SharePermission) => void;
  lockedToRead?: boolean;
  lockedReason?: string;
}) {
  return (
    <Segmented
      ariaLabel="Access"
      value={value}
      onChange={onChange}
      options={[
        { value: "read", label: "View only" },
        {
          value: "write",
          label: "Can edit",
          disabled: lockedToRead,
          title: lockedToRead ? lockedReason : undefined,
        },
      ]}
    />
  );
}
