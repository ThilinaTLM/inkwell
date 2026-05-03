// Admin route shell. Two tabs (Users + Invites) handed off to their own
// panels; auth context comes from `useMe`.

import { MailAdd02Icon, UserMultipleIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import { PaperSurface } from "@/components/PaperSurface";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Topbar } from "@/components/Topbar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useMe } from "@/features/auth/hooks";

import { InvitesPanel } from "./InvitesPanel";
import { UsersPanel } from "./UsersPanel";

export default function AdminPage() {
  const me = useMe();
  const self = me.data;
  if (!self) return null;

  return (
    <PaperSurface variant="page" className="flex flex-col">
      <Topbar user={self} actions={<ThemeToggle />} />

      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-10">
        <header className="mb-8">
          <h1 className="font-heading text-3xl text-foreground">Admin</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage who can sign in and how they get there.
          </p>
        </header>

        <Tabs defaultValue="users" className="gap-6">
          <TabsList>
            <TabsTrigger value="users" className="gap-1.5">
              <HugeiconsIcon icon={UserMultipleIcon} strokeWidth={2} />
              Users
            </TabsTrigger>
            <TabsTrigger value="invites" className="gap-1.5">
              <HugeiconsIcon icon={MailAdd02Icon} strokeWidth={2} />
              Invites
            </TabsTrigger>
          </TabsList>

          <TabsContent value="users">
            <UsersPanel selfId={self.id} />
          </TabsContent>
          <TabsContent value="invites">
            <InvitesPanel />
          </TabsContent>
        </Tabs>
      </main>
    </PaperSurface>
  );
}
