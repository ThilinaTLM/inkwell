// SettingsPage — profile, preferences, security and the shortcut
// reference.
//
// Lives under `features/settings/` rather than `features/auth/` because
// most of its surface is per-user preferences, not identity. Auth-only
// concerns (login, invite redemption, password change) keep their home
// in `features/auth/`; the shared `TextFormField` component there is
// imported by SecurityTab.
//
// Legacy `/account` URLs redirect to `/settings` in `app/routes.tsx`.

import {
  KeyboardIcon,
  LockPasswordIcon,
  PaintBoardIcon,
  UserCircleIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import { AppShell } from "@/components/layout/AppShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useMe } from "@/data/auth";

import { PreferencesTab } from "./PreferencesTab";
import { ProfileTab } from "./ProfileTab";
import { SecurityTab } from "./SecurityTab";
import { ShortcutsTab } from "./ShortcutsTab";

export function SettingsPage() {
  const me = useMe();
  const self = me.data;
  if (!self) return null;

  return (
    <AppShell>
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 py-4">
        <PageHeader title="Settings" description="Profile, preferences, and security." />

        <Tabs defaultValue="profile" className="gap-5">
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
            <TabsTrigger value="shortcuts" className="gap-1.5">
              <HugeiconsIcon icon={KeyboardIcon} strokeWidth={2} />
              Shortcuts
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
          <TabsContent value="shortcuts">
            <ShortcutsTab />
          </TabsContent>
        </Tabs>
      </div>
    </AppShell>
  );
}
