// Admin → Users tab.
//
// Lists all members with their role, status, scene count, and last
// login. Promotes/demotes to admin, toggles disabled, deletes (via the
// confirm-phrase dialog).

import {
  Delete02Icon,
  MoreHorizontalIcon,
  Shield01Icon,
  SquareLockIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAdminUsers, useUpdateAdminUser } from "@/features/admin/hooks";
import type { AdminUser } from "@/lib/api/client";
import { errorMessage } from "@/lib/errors";
import { fmtDateTime } from "@/lib/format";
import { userDisplayName } from "@/lib/user";
import { DeleteUserDialog } from "./DeleteUserDialog";
import { TableSkeleton } from "./TableSkeleton";

export function UsersPanel({ selfId }: { selfId: string }) {
  const usersQuery = useAdminUsers();
  const updateUser = useUpdateAdminUser();
  const [confirmDelete, setConfirmDelete] = useState<AdminUser | null>(null);

  async function patch(
    u: AdminUser,
    body: Parameters<typeof updateUser.mutateAsync>[0]["patch"],
    label: string,
  ) {
    try {
      await updateUser.mutateAsync({ id: u.id, patch: body });
      toast.success(label);
    } catch (e) {
      toast.error(errorMessage(e, "update failed"));
    }
  }

  const users = usersQuery.data ?? null;
  const busyId = updateUser.isPending ? updateUser.variables?.id : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between font-heading text-sm font-medium">
          <span>Users</span>
          {users && <Badge variant="secondary">{users.length}</Badge>}
        </CardTitle>
        <CardDescription>Promote, disable, or remove members of your workspace.</CardDescription>
      </CardHeader>
      <CardContent className="px-0">
        {usersQuery.isPending ? (
          <div className="px-4 pb-2">
            <TableSkeleton rows={4} cols={6} />
          </div>
        ) : !users || users.length === 0 ? (
          <div className="px-4 pb-4 text-center text-xs text-muted-foreground">No users yet.</div>
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
                const name = userDisplayName(u);
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
                          {/* Active = success ramp; chart-5 is the green tag/
                              success token in both themes. */}
                          <span className="size-1.5 rounded-full bg-chart-5" />
                          Active
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {u.sceneCount}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {u.lastLoginAt ? fmtDateTime(u.lastLoginAt) : "—"}
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
                            <HugeiconsIcon icon={MoreHorizontalIcon} strokeWidth={2} />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={() =>
                                patch(
                                  u,
                                  { isAdmin: !u.isAdmin },
                                  u.isAdmin
                                    ? `Demoted ${u.email} to user.`
                                    : `Promoted ${u.email} to admin.`,
                                )
                              }
                            >
                              <HugeiconsIcon icon={Shield01Icon} strokeWidth={2} />
                              {u.isAdmin ? "Demote to user" : "Promote to admin"}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() =>
                                patch(
                                  u,
                                  { disabled: !u.disabled },
                                  u.disabled ? `Enabled ${u.email}.` : `Disabled ${u.email}.`,
                                )
                              }
                            >
                              <HugeiconsIcon icon={SquareLockIcon} strokeWidth={2} />
                              {u.disabled ? "Enable" : "Disable"}
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              variant="destructive"
                              onClick={() => setConfirmDelete(u)}
                            >
                              <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} />
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
      />
    </Card>
  );
}
