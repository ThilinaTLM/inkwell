// Settings → Admin (admins only): users and invites, as two calm lists.
// The API stays under /api/admin/*.

import {
  Cancel01Icon,
  Copy01Icon,
  Delete02Icon,
  MailAdd02Icon,
  MoreHorizontalIcon,
  Shield01Icon,
  SquareLockIcon,
  SquareUnlock01Icon,
  UserIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useId, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  useAdminUsers,
  useCreateInvite,
  useInvites,
  useRevokeInvite,
  useUpdateAdminUser,
} from "@/data/admin";
import { confirmDialog } from "@/features/dialogs/dialogStore";
import { ChipGroup } from "@/features/settings/controls";
import { SettingsCard } from "@/features/settings/SettingsCard";
import type { AdminUser, Invite } from "@/lib/api/client";
import { copyToClipboard } from "@/lib/clipboard";
import { errorMessage } from "@/lib/errors";
import { expiresPhrase, relTime } from "@/lib/format";
import { inviteUrl } from "@/lib/url";
import { userDisplayName } from "@/lib/user";
import { cn } from "@/lib/utils";
import { DeleteUserDialog } from "./DeleteUserDialog";
import { Avatar, SELF_REASON } from "./userBits";

const EXPIRY: Array<{ value: string; label: string; hours: number | null }> = [
  { value: "1", label: "1 hour", hours: 1 },
  { value: "24", label: "1 day", hours: 24 },
  { value: "168", label: "7 days", hours: 168 },
  { value: "720", label: "30 days", hours: 720 },
  { value: "never", label: "Never", hours: null },
];

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

function Pill({ tone, children }: { tone: "accent" | "warning"; children: string }) {
  return (
    <span
      className={cn(
        "rounded-full px-2 py-px text-[11px] font-medium",
        tone === "accent" && "bg-accent-soft text-accent-text",
        tone === "warning" && "bg-warning-soft text-warning",
      )}
    >
      {children}
    </span>
  );
}

export function AdminSection({ selfId }: { selfId: string }) {
  return (
    <SettingsCard id="admin" title="Admin" description="Manage who can use this workspace.">
      <div className="grid gap-8">
        <UsersList selfId={selfId} />
        <InvitesList />
      </div>
    </SettingsCard>
  );
}

function SubHeading({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="mb-2 flex items-baseline gap-2">
      <h3 className="text-[13px] font-semibold">{title}</h3>
      {hint ? <span className="text-xs text-muted-foreground">{hint}</span> : null}
    </div>
  );
}

// ─── Users ────────────────────────────────────────────────────────────

function UsersList({ selfId }: { selfId: string }) {
  const users = useAdminUsers();
  const update = useUpdateAdminUser();
  const [toDelete, setToDelete] = useState<AdminUser | null>(null);

  const rows = useMemo(
    () =>
      [...(users.data ?? [])].sort((a, b) =>
        collator.compare(userDisplayName(a), userDisplayName(b)),
      ),
    [users.data],
  );

  async function patch(u: AdminUser, p: { isAdmin?: boolean; disabled?: boolean }, verb: string) {
    try {
      await update.mutateAsync({ id: u.id, patch: p });
      toast.success(`${verb} ${u.email}`);
    } catch (e) {
      toast.error(errorMessage(e, "update failed"));
    }
  }

  return (
    <div>
      <SubHeading title="Users" hint={users.data ? `${users.data.length}` : undefined} />
      {users.isPending ? (
        <p className="py-4 text-sm text-muted-foreground">Loading users…</p>
      ) : users.isError ? (
        <p role="alert" className="py-4 text-sm text-destructive">
          {errorMessage(users.error, "could not load users")}
        </p>
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border">
          {rows.map((u) => {
            const self = u.id === selfId;
            return (
              <li key={u.id} className="flex items-center gap-3 px-3 py-2.5">
                <Avatar user={u} size={32} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    <span
                      className={cn(
                        "truncate text-[13px] font-medium",
                        u.disabled && "text-muted-foreground",
                      )}
                    >
                      {userDisplayName(u)}
                    </span>
                    {self ? <span className="text-xs text-muted-foreground">(you)</span> : null}
                    {u.isAdmin ? <Pill tone="accent">Admin</Pill> : null}
                    {u.disabled ? <Pill tone="warning">Disabled</Pill> : null}
                  </div>
                  <div className="truncate text-xs text-muted-foreground">
                    {u.email}
                    <span className="sm:hidden">
                      {" "}
                      · {u.fileCount} {u.fileCount === 1 ? "file" : "files"}
                    </span>
                  </div>
                </div>
                <div className="hidden w-16 shrink-0 text-right text-xs text-muted-foreground tabular-nums sm:block">
                  {u.fileCount} {u.fileCount === 1 ? "file" : "files"}
                </div>
                <div className="hidden w-24 shrink-0 text-right text-xs text-muted-foreground sm:block">
                  {u.lastLoginAt ? relTime(u.lastLoginAt) : "Never signed in"}
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Actions for ${u.email}`}
                        disabled={self}
                        title={self ? SELF_REASON : undefined}
                        className="shrink-0 text-muted-foreground"
                      />
                    }
                  >
                    <HugeiconsIcon icon={MoreHorizontalIcon} strokeWidth={2} />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48">
                    {u.isAdmin ? (
                      <DropdownMenuItem
                        onClick={() => void patch(u, { isAdmin: false }, "Demoted")}
                      >
                        <HugeiconsIcon icon={UserIcon} strokeWidth={2} />
                        Remove admin
                      </DropdownMenuItem>
                    ) : (
                      <DropdownMenuItem
                        onClick={() => void patch(u, { isAdmin: true }, "Promoted")}
                      >
                        <HugeiconsIcon icon={Shield01Icon} strokeWidth={2} />
                        Make admin
                      </DropdownMenuItem>
                    )}
                    {u.disabled ? (
                      <DropdownMenuItem
                        onClick={() => void patch(u, { disabled: false }, "Enabled")}
                      >
                        <HugeiconsIcon icon={SquareUnlock01Icon} strokeWidth={2} />
                        Enable
                      </DropdownMenuItem>
                    ) : (
                      <DropdownMenuItem
                        onClick={() => void patch(u, { disabled: true }, "Disabled")}
                      >
                        <HugeiconsIcon icon={SquareLockIcon} strokeWidth={2} />
                        Disable
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem variant="destructive" onClick={() => setToDelete(u)}>
                      <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} />
                      Delete…
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </li>
            );
          })}
        </ul>
      )}
      <DeleteUserDialog target={toDelete} onOpenChange={(open) => !open && setToDelete(null)} />
    </div>
  );
}

// ─── Invites ──────────────────────────────────────────────────────────

async function copyInvite(token: string) {
  const url = inviteUrl(token);
  if (await copyToClipboard(url)) toast.success("Invite link copied");
  else toast.error("Couldn't access the clipboard", { description: url });
}

function InvitesList() {
  const invites = useInvites();
  const create = useCreateInvite();
  const revoke = useRevokeInvite();
  const [expiry, setExpiry] = useState("168");
  const [note, setNote] = useState("");
  const noteId = useId();

  const pending = useMemo(
    () =>
      (invites.data ?? [])
        .filter((i) => i.status === "pending")
        .sort((a, b) => b.createdAt - a.createdAt),
    [invites.data],
  );

  async function submit() {
    if (create.isPending) return;
    try {
      const hours = EXPIRY.find((e) => e.value === expiry)?.hours ?? null;
      const inv = await create.mutateAsync({ expiresInHours: hours, note: note.trim() || null });
      const url = inv.url || inviteUrl(inv.token);
      if (await copyToClipboard(url)) toast.success("Invite link copied");
      else toast.success("Invite created", { description: url });
      setNote("");
    } catch (e) {
      toast.error(errorMessage(e, "could not create invite"));
    }
  }

  async function doRevoke(i: Invite) {
    const ok = await confirmDialog({
      title: "Revoke this invite?",
      description: "The link stops working immediately.",
      confirmLabel: "Revoke",
    });
    if (!ok) return;
    try {
      await revoke.mutateAsync(i.token);
      toast.success("Invite revoked");
    } catch (e) {
      toast.error(errorMessage(e, "could not revoke invite"));
    }
  }

  return (
    <div>
      <SubHeading title="Invites" hint="Anyone with a link can create an account." />
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
        className="mb-3 grid gap-3 rounded-xl bg-surface-2 p-3.5"
      >
        <div className="grid gap-1.5">
          <label htmlFor={noteId} className="text-xs text-muted-foreground">
            Note (optional)
          </label>
          <Input
            id={noteId}
            value={note}
            maxLength={200}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. For Maya’s contractor"
            className="bg-card"
          />
        </div>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="grid gap-1.5">
            <span className="text-xs text-muted-foreground">Link expires in</span>
            <ChipGroup
              ariaLabel="Invite expiry"
              value={expiry}
              onChange={setExpiry}
              options={EXPIRY}
            />
          </div>
          <Button type="submit" disabled={create.isPending}>
            <HugeiconsIcon icon={MailAdd02Icon} strokeWidth={2} />
            {create.isPending ? "Creating…" : "Create & copy link"}
          </Button>
        </div>
      </form>

      {invites.isPending ? (
        <p className="py-3 text-sm text-muted-foreground">Loading invites…</p>
      ) : invites.isError ? (
        <p role="alert" className="py-3 text-sm text-destructive">
          {errorMessage(invites.error, "could not load invites")}
        </p>
      ) : pending.length === 0 ? (
        <p className="py-2 text-sm text-muted-foreground">No pending invites.</p>
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border">
          {pending.map((i) => (
            <li key={i.token} className="flex items-center gap-3 px-3 py-2.5">
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] font-medium">{i.note || "Invite link"}</div>
                <div className="truncate text-xs text-muted-foreground">
                  Created {relTime(i.createdAt)}
                  {" · "}
                  {expiresPhrase(i.expiresAt) ?? "never expires"}
                </div>
              </div>
              <Button variant="outline" size="sm" onClick={() => void copyInvite(i.token)}>
                <HugeiconsIcon icon={Copy01Icon} strokeWidth={2} />
                Copy link
              </Button>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Revoke invite"
                title="Revoke"
                disabled={revoke.isPending}
                onClick={() => void doRevoke(i)}
                className="text-muted-foreground"
              >
                <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
