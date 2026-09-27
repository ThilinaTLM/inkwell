// Settings → Profile: read-only identity (there are no profile-edit
// endpoints yet).

import type { User } from "@/lib/api/client";
import { userDisplayName, userInitials } from "@/lib/user";
import { SettingRow, SettingsGroup } from "../controls";

export function ProfileSection({ user }: { user: User }) {
  return (
    <SettingsGroup
      title="Identity"
      description="Read-only for now — ask an admin to change your name or email."
    >
      <div className="flex items-center gap-3 pb-3">
        <span className="grid size-11 place-items-center rounded-full bg-accent text-sm font-semibold text-accent-foreground">
          {userInitials(user)}
        </span>
        <div>
          <div className="font-semibold">{userDisplayName(user)}</div>
          <div className="text-xs text-muted-foreground">{user.email}</div>
        </div>
      </div>
      <SettingRow label="Name">
        <span className="text-[13px]">{userDisplayName(user)}</span>
      </SettingRow>
      <SettingRow label="Email">
        <span className="font-mono text-xs">{user.email}</span>
      </SettingRow>
      <SettingRow label="Role" help="Admins can manage users and invites.">
        <span
          className={
            user.isAdmin
              ? "rounded bg-accent px-1.5 py-px text-[11px] text-accent-foreground"
              : "rounded bg-muted px-1.5 py-px text-[11px] text-muted-foreground"
          }
        >
          {user.isAdmin ? "Admin" : "User"}
        </span>
      </SettingRow>
    </SettingsGroup>
  );
}
