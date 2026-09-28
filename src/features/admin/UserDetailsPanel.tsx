// User inspector (wireframe screen 18, right column): role segment,
// status, dates, usage (files + storage). Self-edits are disabled with an
// explanation. Multi-select shows a bulk summary.

import { Delete02Icon, SquareLockIcon, SquareUnlock01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { ReactNode } from "react";
import { DetailsPanel } from "@/components/shell/DetailsPanel";
import { Button } from "@/components/ui/button";
import { fmtBytes } from "@/features/library/helpers";
import { StatusDot } from "@/features/library/ListTable";
import { Segmented } from "@/features/settings/controls";
import type { AdminUser } from "@/lib/api/client";
import { userDisplayName } from "@/lib/user";
import { Avatar, SELF_REASON } from "./userBits";

type Patch = { isAdmin?: boolean; disabled?: boolean };

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-3 border-t border-border pt-2.5">
      <h4 className="mb-2 text-[10.5px] font-semibold tracking-[0.09em] text-muted-foreground uppercase">
        {title}
      </h4>
      {children}
    </section>
  );
}

function Kv({ children }: { children: ReactNode }) {
  return (
    <dl className="grid grid-cols-[86px_1fr] items-center gap-x-2 gap-y-1.5 text-xs">{children}</dl>
  );
}

const fmt = (ms: number | null) =>
  ms ? new Date(ms).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : "Never";

export function UserDetailsPanel({
  users,
  selfId,
  onPatch,
  onDelete,
}: {
  users: AdminUser[];
  selfId: string;
  onPatch: (list: AdminUser[], patch: Patch, verb: string) => Promise<void>;
  onDelete: (u: AdminUser) => void;
}) {
  return (
    <DetailsPanel title="User details">
      {users.length === 0 ? (
        <p className="pt-2 text-xs text-muted-foreground">Select a user to see their details.</p>
      ) : users.length === 1 ? (
        <One
          user={users[0]}
          isSelf={users[0].id === selfId}
          onPatch={onPatch}
          onDelete={onDelete}
        />
      ) : (
        <Many users={users} selfId={selfId} onPatch={onPatch} />
      )}
    </DetailsPanel>
  );
}

function One({
  user: u,
  isSelf,
  onPatch,
  onDelete,
}: {
  user: AdminUser;
  isSelf: boolean;
  onPatch: (list: AdminUser[], patch: Patch, verb: string) => Promise<void>;
  onDelete: (u: AdminUser) => void;
}) {
  return (
    <div className="flex flex-col">
      <div className="mt-1.5 flex items-center gap-2.5">
        <Avatar user={u} size={44} />
        <div className="min-w-0">
          <div className="truncate text-[15px] font-semibold">
            {userDisplayName(u)}{" "}
            {isSelf ? <span className="font-normal text-muted-foreground">(you)</span> : null}
          </div>
          <div className="truncate text-xs text-muted-foreground">{u.email}</div>
        </div>
      </div>

      <Section title="Account">
        <Kv>
          <dt className="text-muted-foreground">Role</dt>
          <dd title={isSelf ? SELF_REASON : undefined}>
            <Segmented<"user" | "admin">
              ariaLabel="Role"
              value={u.isAdmin ? "admin" : "user"}
              onChange={(v) =>
                void onPatch(
                  [u],
                  { isAdmin: v === "admin" },
                  v === "admin" ? "Promoted" : "Demoted",
                )
              }
              options={[
                {
                  value: "user",
                  label: "User",
                  disabled: isSelf,
                  title: isSelf ? SELF_REASON : undefined,
                },
                {
                  value: "admin",
                  label: "Admin",
                  disabled: isSelf,
                  title: isSelf ? SELF_REASON : undefined,
                },
              ]}
            />
          </dd>
          <dt className="text-muted-foreground">Status</dt>
          <dd>
            <StatusDot tone={u.disabled ? "off" : "ok"}>
              {u.disabled ? "Disabled" : "Active"}
            </StatusDot>
          </dd>
          <dt className="text-muted-foreground">Joined</dt>
          <dd>{fmt(u.createdAt)}</dd>
          <dt className="text-muted-foreground">Last login</dt>
          <dd>{fmt(u.lastLoginAt)}</dd>
        </Kv>
      </Section>

      <Section title="Usage">
        <Kv>
          <dt className="text-muted-foreground">Files</dt>
          <dd>{u.fileCount}</dd>
          <dt className="text-muted-foreground">Storage</dt>
          <dd title={`${u.storageBytes ?? 0} bytes, including Trash`}>
            {fmtBytes(u.storageBytes ?? 0)}
          </dd>
        </Kv>
      </Section>

      <Section title="Actions">
        <div className="flex flex-col gap-1.5" title={isSelf ? SELF_REASON : undefined}>
          <Button
            variant={u.disabled ? "outline" : "destructive"}
            size="sm"
            disabled={isSelf}
            onClick={() =>
              void onPatch([u], { disabled: !u.disabled }, u.disabled ? "Enabled" : "Disabled")
            }
          >
            <HugeiconsIcon
              icon={u.disabled ? SquareUnlock01Icon : SquareLockIcon}
              strokeWidth={2}
            />
            {u.disabled ? "Enable account" : "Disable account"}
          </Button>
          <Button variant="destructive" size="sm" disabled={isSelf} onClick={() => onDelete(u)}>
            <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} />
            Delete user…
          </Button>
          {isSelf ? <p className="text-[11.5px] text-muted-foreground">{SELF_REASON}</p> : null}
        </div>
      </Section>
    </div>
  );
}

function Many({
  users,
  selfId,
  onPatch,
}: {
  users: AdminUser[];
  selfId: string;
  onPatch: (list: AdminUser[], patch: Patch, verb: string) => Promise<void>;
}) {
  const files = users.reduce((n, u) => n + u.fileCount, 0);
  const bytes = users.reduce((n, u) => n + (u.storageBytes ?? 0), 0);
  const includesSelf = users.some((u) => u.id === selfId);
  return (
    <div className="flex flex-col">
      <p className="mt-1.5 font-semibold">{users.length} users selected</p>
      <Section title="Usage">
        <Kv>
          <dt className="text-muted-foreground">Files</dt>
          <dd>{files}</dd>
          <dt className="text-muted-foreground">Storage</dt>
          <dd>{fmtBytes(bytes)}</dd>
        </Kv>
      </Section>
      <Section title="Bulk actions">
        <div className="flex flex-wrap gap-1.5">
          <Button
            variant="outline"
            size="sm"
            onClick={() => void onPatch(users, { isAdmin: true }, "Promoted")}
          >
            Make admins
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void onPatch(users, { isAdmin: false }, "Demoted")}
          >
            Make users
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void onPatch(users, { disabled: false }, "Enabled")}
          >
            Enable
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => void onPatch(users, { disabled: true }, "Disabled")}
          >
            Disable
          </Button>
        </div>
        {includesSelf ? (
          <p className="mt-1.5 text-[11.5px] text-muted-foreground">Your own account is skipped.</p>
        ) : null}
      </Section>
    </div>
  );
}
