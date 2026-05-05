// Visual badge for a share's permission. Used in the row header so
// readers can tell View vs Edit links at a glance without having to
// compare URLs.

import { EyeIcon, PencilEdit02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Badge } from "@/components/ui/badge";
import type { SharePermission } from "@/lib/api/client";

export function PermissionBadge({ permission }: { permission: SharePermission }) {
  return permission === "write" ? (
    <Badge variant="default" className="gap-1">
      <HugeiconsIcon icon={PencilEdit02Icon} strokeWidth={2} />
      Can edit
    </Badge>
  ) : (
    <Badge variant="secondary" className="gap-1">
      <HugeiconsIcon icon={EyeIcon} strokeWidth={2} />
      View only
    </Badge>
  );
}
