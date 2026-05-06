// ProfileTab — read-only identity card. Lifted verbatim from the old
// AccountPage. Profile editing (name, email change) is intentionally
// out of scope; once those endpoints exist this is the place to add
// a form.

import { Shield01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { ElevatedCard } from "@/components/ElevatedCard";
import { SectionHeading } from "@/components/SectionHeading";
import { Badge } from "@/components/ui/badge";
import type { User } from "@/lib/api/client";
import { userDisplayName } from "@/lib/user";

interface ProfileTabProps {
  user: User;
}

export function ProfileTab({ user }: ProfileTabProps) {
  const fullName = userDisplayName(user);

  return (
    <ElevatedCard>
      <SectionHeading label="Profile" />
      <div className="px-6 pb-6">
        <p className="mb-4 text-sm text-muted-foreground">Read-only for now.</p>
        <dl className="grid grid-cols-[max-content_1fr] gap-x-8 gap-y-3 text-sm">
          <dt className="text-muted-foreground">Name</dt>
          <dd>{fullName}</dd>
          <dt className="text-muted-foreground">Email</dt>
          <dd className="font-mono text-xs">{user.email}</dd>
          <dt className="text-muted-foreground">Role</dt>
          <dd>
            {user.isAdmin ? (
              <Badge variant="outline" className="gap-1">
                <HugeiconsIcon icon={Shield01Icon} strokeWidth={2} />
                Admin
              </Badge>
            ) : (
              <Badge variant="secondary">User</Badge>
            )}
          </dd>
        </dl>
      </div>
    </ElevatedCard>
  );
}
