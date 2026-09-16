// Users page (admin-only). Two tabs (Members + Invites) handed off to
// their own panels; auth context comes from `useMe`.
//
// The route is `/users` and the visible page title is "Users". The
// underlying API still lives at `/api/admin/*` because those endpoints
// describe authorization, not UI copy. The folder name `features/admin`
// is preserved for the same reason — these hooks call admin endpoints.

import { MailAdd02Icon, UserMultipleIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import { AppShell } from "@/components/layout/AppShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useMe } from "@/data/auth";

import { InvitesPanel } from "./InvitesPanel";
import { UsersPanel } from "./UsersPanel";

export function UsersPage() {
  const me = useMe();
  const self = me.data;
  if (!self) return null;

  return (
    <AppShell>
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-5 py-4">
        <PageHeader
          title="Users"
          description="Manage workspace members, roles, and invite links."
        />

        <Tabs defaultValue="members" className="gap-5">
          <TabsList>
            <TabsTrigger value="members" className="gap-1.5">
              <HugeiconsIcon icon={UserMultipleIcon} strokeWidth={2} />
              Members
            </TabsTrigger>
            <TabsTrigger value="invites" className="gap-1.5">
              <HugeiconsIcon icon={MailAdd02Icon} strokeWidth={2} />
              Invites
            </TabsTrigger>
          </TabsList>

          <TabsContent value="members">
            <UsersPanel selfId={self.id} />
          </TabsContent>
          <TabsContent value="invites">
            <InvitesPanel />
          </TabsContent>
        </Tabs>
      </div>
    </AppShell>
  );
}
