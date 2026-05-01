import { ChangeEvent, useEffect, useMemo, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Alert02Icon,
  CheckmarkCircle02Icon,
  Copy01Icon,
  Delete02Icon,
  Loading03Icon,
  MailAdd02Icon,
  MoreHorizontalIcon,
  Shield01Icon,
  SquareLockIcon,
  Tick02Icon,
  UserMultipleIcon,
} from "@hugeicons/core-free-icons";
import { toast } from "sonner";

import {
  AdminUser,
  ApiError,
  Invite,
  InviteStatus,
  User,
  admin,
} from "@/api";
import { Topbar } from "@/components/Topbar";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface AdminProps {
  user: User;
}

export default function Admin({ user: self }: AdminProps) {
  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground">
      <Topbar user={self} />

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
        <header className="mb-6">
          <h1 className="font-heading text-base font-semibold tracking-tight">
            Admin
          </h1>
          <p className="mt-0.5 text-xs/relaxed text-muted-foreground">
            Manage who can sign in and how they get there.
          </p>
        </header>

        <Tabs defaultValue="users" className="gap-4">
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
    </div>
  );
}

// ─── Users ──────────────────────────────────────────────────────────────

function UsersPanel({ selfId }: { selfId: string }) {
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<AdminUser | null>(null);

  async function refresh() {
    try {
      setUsers(await admin.listUsers());
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "failed to load users");
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function patch(
    u: AdminUser,
    body: Parameters<typeof admin.updateUser>[1],
    label: string
  ) {
    setBusyId(u.id);
    try {
      const updated = await admin.updateUser(u.id, body);
      setUsers((prev) =>
        prev ? prev.map((x) => (x.id === u.id ? updated : x)) : prev
      );
      toast.success(label);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "update failed");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between font-heading text-sm font-medium">
          <span>Users</span>
          {users && (
            <Badge variant="secondary">{users.length}</Badge>
          )}
        </CardTitle>
        <CardDescription>
          Promote, disable, or remove members of your workspace.
        </CardDescription>
      </CardHeader>
      <CardContent className="px-0">
        {users === null ? (
          <div className="px-4 pb-2">
            <TableSkeleton rows={4} cols={6} />
          </div>
        ) : users.length === 0 ? (
          <div className="px-4 pb-4 text-center text-xs text-muted-foreground">
            No users yet.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Scenes</TableHead>
                <TableHead>Last login</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((u) => {
                const isSelf = u.id === selfId;
                const name =
                  [u.firstName, u.lastName].filter(Boolean).join(" ") || "—";
                return (
                  <TableRow
                    key={u.id}
                    data-disabled={u.disabled || undefined}
                    className="data-[disabled]:opacity-60"
                  >
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <span className="font-medium">{name}</span>
                        {isSelf && (
                          <Badge variant="outline" className="h-4 text-[0.5625rem]">
                            you
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-[0.6875rem] text-muted-foreground">
                      {u.email}
                    </TableCell>
                    <TableCell>
                      {u.isAdmin ? (
                        <Badge variant="outline" className="gap-1">
                          <HugeiconsIcon icon={Shield01Icon} strokeWidth={2} />
                          Admin
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">User</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {u.disabled ? (
                        <Badge variant="destructive">Disabled</Badge>
                      ) : (
                        <Badge variant="secondary" className="gap-1">
                          <span className="size-1.5 rounded-full bg-emerald-500" />
                          Active
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {u.sceneCount}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {u.lastLoginAt ? fmtDate(u.lastLoginAt) : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      {!isSelf && (
                        <DropdownMenu>
                          <DropdownMenuTrigger
                            render={
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                disabled={busyId === u.id}
                                aria-label={`Actions for ${u.email}`}
                              />
                            }
                          >
                            <HugeiconsIcon
                              icon={MoreHorizontalIcon}
                              strokeWidth={2}
                            />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={() =>
                                patch(
                                  u,
                                  { isAdmin: !u.isAdmin },
                                  u.isAdmin
                                    ? `Demoted ${u.email} to user.`
                                    : `Promoted ${u.email} to admin.`
                                )
                              }
                            >
                              <HugeiconsIcon
                                icon={Shield01Icon}
                                strokeWidth={2}
                              />
                              {u.isAdmin ? "Demote to user" : "Promote to admin"}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() =>
                                patch(
                                  u,
                                  { disabled: !u.disabled },
                                  u.disabled
                                    ? `Enabled ${u.email}.`
                                    : `Disabled ${u.email}.`
                                )
                              }
                            >
                              <HugeiconsIcon
                                icon={SquareLockIcon}
                                strokeWidth={2}
                              />
                              {u.disabled ? "Enable" : "Disable"}
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              variant="destructive"
                              onClick={() => setConfirmDelete(u)}
                            >
                              <HugeiconsIcon
                                icon={Delete02Icon}
                                strokeWidth={2}
                              />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>

      <DeleteUserDialog
        target={confirmDelete}
        onOpenChange={(open) => !open && setConfirmDelete(null)}
        onDeleted={(id) => {
          setUsers((prev) => (prev ? prev.filter((x) => x.id !== id) : prev));
          setConfirmDelete(null);
        }}
      />
    </Card>
  );
}

interface DeleteUserDialogProps {
  target: AdminUser | null;
  onOpenChange: (open: boolean) => void;
  onDeleted: (id: string) => void;
}

function DeleteUserDialog({
  target,
  onOpenChange,
  onDeleted,
}: DeleteUserDialogProps) {
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const phrase = target ? `DELETE ${target.email}` : "";
  const matches = !!target && typed === phrase;

  useEffect(() => {
    if (!target) {
      setTyped("");
      setBusy(false);
    }
  }, [target]);

  async function run() {
    if (!target || !matches) return;
    setBusy(true);
    try {
      await admin.deleteUser(target.id);
      toast.success(`Deleted ${target.email}.`);
      onDeleted(target.id);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "delete failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AlertDialog open={!!target} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete user</AlertDialogTitle>
          <AlertDialogDescription>
            This permanently deletes <strong>{target?.email}</strong>, all of
            their scenes ({target?.sceneCount}), and any share tokens they own.
            This cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="confirm-phrase">
            Type{" "}
            <code className="rounded bg-muted px-1 py-0.5 font-mono text-[0.6875rem]">
              {phrase}
            </code>{" "}
            to confirm
          </Label>
          <Input
            id="confirm-phrase"
            value={typed}
            onChange={(e: ChangeEvent<HTMLInputElement>) =>
              setTyped(e.target.value)
            }
            autoFocus
            disabled={busy}
          />
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={!matches || busy}
            onClick={(e) => {
              e.preventDefault();
              void run();
            }}
          >
            {busy ? "Deleting…" : "Delete user"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// ─── Invites ────────────────────────────────────────────────────────────

const EXPIRY_OPTIONS: { label: string; value: string; hours: number | null }[] = [
  { label: "1 hour", value: "1", hours: 1 },
  { label: "1 day", value: "24", hours: 24 },
  { label: "7 days", value: "168", hours: 24 * 7 },
  { label: "30 days", value: "720", hours: 24 * 30 },
  { label: "Never", value: "never", hours: null },
];

function InvitesPanel() {
  const [list, setList] = useState<Invite[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [expiryValue, setExpiryValue] = useState("168");
  const [latest, setLatest] = useState<{ url: string; token: string } | null>(
    null
  );

  async function refresh() {
    try {
      setList(await admin.listInvites());
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "failed to load invites");
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function generate() {
    setBusy(true);
    try {
      const opt = EXPIRY_OPTIONS.find((o) => o.value === expiryValue);
      const inv = await admin.createInvite(opt?.hours ?? null);
      const absolute = inv.url.startsWith("http")
        ? inv.url
        : `${window.location.origin}${inv.url}`;
      setLatest({ url: absolute, token: inv.token });
      try {
        await navigator.clipboard.writeText(absolute);
        toast.success("Invite created and copied to clipboard.");
      } catch {
        toast.success("Invite created.");
      }
      await refresh();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "could not create invite");
    } finally {
      setBusy(false);
    }
  }

  async function copy(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Copied to clipboard.");
    } catch {
      toast.error("Could not copy.");
    }
  }

  async function revoke(token: string) {
    setBusy(true);
    try {
      await admin.revokeInvite(token);
      toast.success("Invite revoked.");
      await refresh();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "revoke failed");
    } finally {
      setBusy(false);
    }
  }

  const sorted = useMemo(
    () => (list ? [...list].sort((a, b) => b.createdAt - a.createdAt) : null),
    [list]
  );

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 font-heading text-sm font-medium">
            <HugeiconsIcon icon={MailAdd02Icon} strokeWidth={2} />
            Generate invite link
          </CardTitle>
          <CardDescription>
            Single-use links new members exchange for an account.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex flex-wrap items-end gap-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="expiry">Expires in</Label>
              <Select
                value={expiryValue}
                onValueChange={(v) => v && setExpiryValue(v)}
                disabled={busy}
              >
                <SelectTrigger id="expiry" className="min-w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EXPIRY_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={generate} disabled={busy}>
              {busy ? (
                <HugeiconsIcon
                  icon={Loading03Icon}
                  strokeWidth={2}
                  className="animate-spin"
                />
              ) : (
                <HugeiconsIcon icon={MailAdd02Icon} strokeWidth={2} />
              )}
              Create invite link
            </Button>
          </div>

          {latest && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="invite-url">Latest invite</Label>
              <div className="flex gap-1.5">
                <Input
                  id="invite-url"
                  readOnly
                  value={latest.url}
                  onFocus={(e) => e.currentTarget.select()}
                  className="font-mono text-[0.6875rem]"
                />
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => copy(latest.url)}
                  aria-label="Copy invite link"
                >
                  <HugeiconsIcon icon={Copy01Icon} strokeWidth={2} />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between font-heading text-sm font-medium">
            <span>Invites</span>
            {sorted && <Badge variant="secondary">{sorted.length}</Badge>}
          </CardTitle>
          <CardDescription>All invites issued from this workspace.</CardDescription>
        </CardHeader>
        <CardContent className="px-0">
          {sorted === null ? (
            <div className="px-4 pb-2">
              <TableSkeleton rows={3} cols={5} />
            </div>
          ) : sorted.length === 0 ? (
            <div className="px-4 pb-4 text-center text-xs text-muted-foreground">
              No invites yet.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Token</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Expires</TableHead>
                  <TableHead>Used by</TableHead>
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {sorted.map((inv) => (
                  <TableRow key={inv.token}>
                    <TableCell>
                      <code className="font-mono text-[0.6875rem]">
                        {inv.token.slice(0, 10)}…
                      </code>
                    </TableCell>
                    <TableCell>
                      <StatusPill status={inv.status} />
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {fmtDate(inv.createdAt)}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {inv.expiresAt ? fmtDate(inv.expiresAt) : "Never"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {inv.usedByEmail ?? "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      {inv.status === "pending" && (
                        <DropdownMenu>
                          <DropdownMenuTrigger
                            render={
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                disabled={busy}
                                aria-label="Invite actions"
                              />
                            }
                          >
                            <HugeiconsIcon
                              icon={MoreHorizontalIcon}
                              strokeWidth={2}
                            />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={() =>
                                copy(
                                  `${window.location.origin}/invite/${inv.token}`
                                )
                              }
                            >
                              <HugeiconsIcon icon={Copy01Icon} strokeWidth={2} />
                              Copy link
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              variant="destructive"
                              onClick={() => revoke(inv.token)}
                            >
                              <HugeiconsIcon
                                icon={Delete02Icon}
                                strokeWidth={2}
                              />
                              Revoke
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatusPill({ status }: { status: InviteStatus }) {
  switch (status) {
    case "pending":
      return (
        <Badge variant="secondary" className="gap-1">
          <span className="size-1.5 rounded-full bg-amber-400" />
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

function TableSkeleton({ rows, cols }: { rows: number; cols: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex gap-3">
          {Array.from({ length: cols }).map((_, c) => (
            <Skeleton
              key={c}
              className="h-4 flex-1"
              style={{ maxWidth: `${20 + ((r + c) % 4) * 12}%` }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

function fmtDate(ms: number): string {
  const d = new Date(ms);
  return (
    d.toLocaleDateString() +
    " " +
    d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
  );
}

// keep Tick02Icon referenced for tree-shake stability
void Tick02Icon;
