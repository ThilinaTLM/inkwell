// Invite status badge.

import { Alert02Icon, CheckmarkCircle02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import { Badge } from "@/components/ui/badge";
import type { InviteStatus } from "@/lib/api/client";

export function StatusPill({ status }: { status: InviteStatus }) {
  switch (status) {
    case "pending":
      return (
        <Badge variant="secondary" className="gap-1">
          {/* Pending = warning ramp; chart-3 is the warm-yellow accent
              tuned for both themes. */}
          <span className="size-1.5 rounded-full bg-chart-3" />
          Pending
        </Badge>
      );
    case "used":
      return (
        <Badge variant="outline" className="gap-1">
          <HugeiconsIcon icon={CheckmarkCircle02Icon} strokeWidth={2} />
          Used
        </Badge>
      );
    case "revoked":
      return (
        <Badge variant="destructive" className="gap-1">
          Revoked
        </Badge>
      );
    case "expired":
      return (
        <Badge variant="outline" className="gap-1 text-muted-foreground">
          <HugeiconsIcon icon={Alert02Icon} strokeWidth={2} />
          Expired
        </Badge>
      );
  }
}
