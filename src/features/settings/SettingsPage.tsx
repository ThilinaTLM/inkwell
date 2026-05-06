// SettingsPage — replaces the pre-rebrand "Account" page.
//
// Three tabs:
//   Profile      — read-only identity (name / email / role).
//   Preferences  — appearance, drawio editor style, default file kind.
//   Security     — change password.
//
// Lives under `features/settings/` rather than `features/auth/` because
// most of its surface is per-user preferences, not identity. Auth-only
// concerns (login, invite redemption, password change) keep their home
// in `features/auth/`; the shared `TextFormField` component there is
// imported by SecurityTab.
//
// Legacy `/account` URLs redirect to `/settings` in `app/routes.tsx`.

import {
  LockPasswordIcon,
  PaintBoardIcon,
  Settings02Icon,
  UserCircleIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import { AppPage, AppPageHeader } from "@/components/AppPage";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useMe } from "@/data/auth";

import { PreferencesTab } from "./PreferencesTab";
import { ProfileTab } from "./ProfileTab";
import { SecurityTab } from "./SecurityTab";

export function SettingsPage() {
  const me = useMe();
  const self = me.data;
  if (!self) return null;

  return (
    <AppPage user={self}>
      <AppPageHeader
        icon={Settings02Icon}
        title="Settings"
        description="Profile, preferences, and security."
        backTo="/"
        backLabel="Back to dashboard"
      />

      <Tabs defaultValue="profile" className="gap-6">
        <TabsList>
          <TabsTrigger value="profile" className="gap-1.5">
            <HugeiconsIcon icon={UserCircleIcon} strokeWidth={2} />
            Profile
          </TabsTrigger>
          <TabsTrigger value="preferences" className="gap-1.5">
            <HugeiconsIcon icon={PaintBoardIcon} strokeWidth={2} />
            Preferences
          </TabsTrigger>
          <TabsTrigger value="security" className="gap-1.5">
            <HugeiconsIcon icon={LockPasswordIcon} strokeWidth={2} />
            Security
          </TabsTrigger>
        </TabsList>

        <TabsContent value="profile">
          <ProfileTab user={self} />
        </TabsContent>
        <TabsContent value="preferences">
          <PreferencesTab />
        </TabsContent>
        <TabsContent value="security">
          <SecurityTab />
        </TabsContent>
      </Tabs>
    </AppPage>
  );
}
