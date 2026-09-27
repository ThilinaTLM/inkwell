// Shared bits for the Users tab and its details panel.

import type { AdminUser } from "@/lib/api/client";
import { userInitials } from "@/lib/user";

export const SELF_REASON = "You can't change your own role or status, or delete yourself.";

export function Avatar({ user, size = 24 }: { user: AdminUser; size?: number }) {
  return (
    <span
      aria-hidden
      style={{ width: size, height: size, fontSize: size * 0.4 }}
      className="grid shrink-0 place-items-center rounded-full bg-accent font-semibold text-accent-foreground"
    >
      {userInitials(user)}
    </span>
  );
}
