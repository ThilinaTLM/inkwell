// Users tab (wireframe screen 18): checkbox table with sortable headers,
// role / status chips, row ⋯ + right-click menu (page commands), a
// details panel (role segment, status, usage incl. storage) and bulk
// disable / enable / role change. Acting on yourself is disabled with an
// explanation.
//
// Page commands: user.details (↵) · user.makeAdmin · user.makeUser ·
// user.disable · user.enable · user.delete (⌘⌫)

import {
  Delete02Icon,
  InformationCircleIcon,
  MoreHorizontalIcon,
  Shield01Icon,
  SquareLockIcon,
  SquareUnlock01Icon,
  UserIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { FilterBar, FilterChip, StatusBar } from "@/components/shell/page";
import { setDetailsOpen } from "@/components/shell/shellStore";
import { Button } from "@/components/ui/button";
import { ContextMenu, ContextMenuContent, ContextMenuTrigger } from "@/components/ui/context-menu";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAdminUsers, useUpdateAdminUser } from "@/data/admin";
import { fmtBytes, fmtShortDate } from "@/features/library/helpers";
import {
  CheckTd,
  CheckTh,
  EmptyRow,
  ListRow,
  ListTable,
  StatusDot,
  Td,
  Th,
} from "@/features/library/ListTable";
import { SelectedCount, useToggleSort } from "@/features/library/parts";
import { useListSelection, useLocalSelState } from "@/features/library/useListSelection";
import type { AdminUser } from "@/lib/api/client";
import { CommandMenuItems } from "@/lib/commands/CommandMenuItems";
import { type Command, useRegisterCommands } from "@/lib/commands/registry";
import { errorMessage } from "@/lib/errors";
import { userDisplayName } from "@/lib/user";
import { cn } from "@/lib/utils";
import { DeleteUserDialog } from "./DeleteUserDialog";
import { UserDetailsPanel } from "./UserDetailsPanel";
import { Avatar, SELF_REASON } from "./userBits";

type SortKey = "name" | "email" | "role" | "status" | "files" | "storage" | "lastLogin";
const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

const MENU_IDS = [
  "user.details",
  "-",
  "user.makeAdmin",
  "user.makeUser",
  "-",
  "user.enable",
  "user.disable",
  "user.delete",
];

export function UsersTab({ selfId, query }: { selfId: string; query: string }) {
  const users = useAdminUsers();
  const update = useUpdateAdminUser();
  const [role, setRole] = useState<"all" | "admin" | "user">("all");
  const [status, setStatus] = useState<"all" | "active" | "disabled">("all");
  const [sort, onSort] = useToggleSort<SortKey>({ key: "name", dir: "asc" });
  const [confirmDelete, setConfirmDelete] = useState<AdminUser | null>(null);
  const now = Date.now();
  const all = users.data ?? [];

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const list = all.filter((u) => {
      if (role === "admin" && !u.isAdmin) return false;
      if (role === "user" && u.isAdmin) return false;
      if (status === "active" && u.disabled) return false;
      if (status === "disabled" && !u.disabled) return false;
      return !needle || `${userDisplayName(u)} ${u.email}`.toLowerCase().includes(needle);
    });
    const sign = sort.dir === "asc" ? 1 : -1;
    return list.sort((a, b) => {
      switch (sort.key) {
        case "email":
          return sign * collator.compare(a.email, b.email);
        case "role":
          return sign * (Number(b.isAdmin) - Number(a.isAdmin));
        case "status":
          return sign * (Number(a.disabled) - Number(b.disabled));
        case "files":
          return sign * (a.fileCount - b.fileCount);
        case "storage":
          return sign * ((a.storageBytes ?? 0) - (b.storageBytes ?? 0));
        case "lastLogin":
          return sign * ((a.lastLoginAt ?? 0) - (b.lastLoginAt ?? 0));
        default:
          return sign * collator.compare(userDisplayName(a), userDisplayName(b));
      }
    });
  }, [all, query, role, status, sort]);

  const order = useMemo(() => rows.map((u) => u.id), [rows]);
  const selection = useListSelection(order, useLocalSelState());
  const byId = useMemo(() => new Map(all.map((u) => [u.id, u])), [all]);
  const selected = useMemo(
    () => selection.selectedKeys.map((id) => byId.get(id)).filter((u): u is AdminUser => !!u),
    [selection.selectedKeys, byId],
  );

  async function patchUsers(
    list: AdminUser[],
    patch: { isAdmin?: boolean; disabled?: boolean },
    verb: string,
  ) {
    const targets = list.filter((u) => u.id !== selfId);
    if (!targets.length) {
      toast.error(SELF_REASON);
      return;
    }
    const results = await Promise.allSettled(
      targets.map((u) => update.mutateAsync({ id: u.id, patch })),
    );
    const failed = results.find((r) => r.status === "rejected") as
      | PromiseRejectedResult
      | undefined;
    if (failed) toast.error(errorMessage(failed.reason, "update failed"));
    else
      toast.success(
        targets.length === 1 ? `${verb} ${targets[0].email}` : `${verb} ${targets.length} users`,
        { description: targets.length < list.length ? "Your own account was skipped." : undefined },
      );
  }

  // Page commands act on the current selection via a ref.
  const selRef = useRef(selected);
  selRef.current = selected;
  const onPage = (route: string) => /^\/users(\/users)?\/?$/.test(route);
  const others = () => selRef.current.filter((u) => u.id !== selfId);
  const selfOnly = () => (others().length === 0 ? SELF_REASON : null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: page commands read live state through refs
  const commands = useMemo<Command[]>(
    () => [
      {
        id: "user.details",
        label: "View details",
        icon: InformationCircleIcon,
        keys: ["enter"],
        group: "view",
        palette: false,
        when: (c) => onPage(c.route) && selRef.current.length === 1,
        run: () => setDetailsOpen(true),
      },
      {
        id: "user.makeAdmin",
        label: () =>
          selRef.current.length > 1 ? `Make ${selRef.current.length} admins` : "Make admin",
        icon: Shield01Icon,
        group: "organise",
        palette: false,
        when: (c) => onPage(c.route) && selRef.current.some((u) => !u.isAdmin),
        disabledReason: selfOnly,
        run: () =>
          void patchUsers(
            selRef.current.filter((u) => !u.isAdmin),
            { isAdmin: true },
            "Promoted",
          ),
      },
      {
        id: "user.makeUser",
        label: () => (selRef.current.length > 1 ? "Change role to user" : "Make regular user"),
        icon: UserIcon,
        group: "organise",
        palette: false,
        when: (c) => onPage(c.route) && selRef.current.some((u) => u.isAdmin),
        disabledReason: selfOnly,
        run: () =>
          void patchUsers(
            selRef.current.filter((u) => u.isAdmin),
            { isAdmin: false },
            "Demoted",
          ),
      },
      {
        id: "user.enable",
        label: "Enable account",
        icon: SquareUnlock01Icon,
        group: "organise",
        palette: false,
        when: (c) => onPage(c.route) && selRef.current.some((u) => u.disabled),
        disabledReason: selfOnly,
        run: () =>
          void patchUsers(
            selRef.current.filter((u) => u.disabled),
            { disabled: false },
            "Enabled",
          ),
      },
      {
        id: "user.disable",
        label: () =>
          selRef.current.length > 1
            ? `Disable ${selRef.current.length} accounts`
            : "Disable account",
        icon: SquareLockIcon,
        group: "organise",
        palette: false,
        destructive: true,
        when: (c) => onPage(c.route) && selRef.current.some((u) => !u.disabled),
        disabledReason: selfOnly,
        run: () =>
          void patchUsers(
            selRef.current.filter((u) => !u.disabled),
            { disabled: true },
            "Disabled",
          ),
      },
      {
        id: "user.delete",
        label: "Delete user…",
        icon: Delete02Icon,
        keys: ["mod+backspace"],
        group: "organise",
        palette: false,
        destructive: true,
        when: (c) => onPage(c.route) && selRef.current.length > 0,
        disabledReason: () =>
          selRef.current.length > 1
            ? "Delete one user at a time"
            : selRef.current[0]?.id === selfId
              ? SELF_REASON
              : null,
        run: () => setConfirmDelete(selRef.current[0]),
      },
    ],
    [selfId],
  );
  useRegisterCommands(commands, [commands]);

  const admins = all.filter((u) => u.isAdmin).length;
  const colSpan = 10;

  return (
    <>
      <FilterBar>
        <span className="pr-0.5">Role</span>
        {(
          [
            ["all", "All"],
            ["admin", "Admins"],
            ["user", "Users"],
          ] as const
        ).map(([v, l]) => (
          <FilterChip key={v} active={role === v} onClick={() => setRole(v)}>
            {l}
          </FilterChip>
        ))}
        <span aria-hidden className="mx-1 h-[18px] w-px bg-border" />
        <span className="pr-0.5">Status</span>
        {(
          [
            ["all", "All"],
            ["active", "Active"],
            ["disabled", "Disabled"],
          ] as const
        ).map(([v, l]) => (
          <FilterChip key={v} active={status === v} onClick={() => setStatus(v)}>
            {l}
          </FilterChip>
        ))}
        {selection.count > 1 ? (
          <>
            <span className="flex-1" />
            <b className="font-semibold text-accent-foreground">{selection.count} selected</b>
            <DropdownMenu>
              <DropdownMenuTrigger render={<Button variant="outline" size="sm" className="h-6" />}>
                Bulk actions
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-52">
                <CommandMenuItems
                  as="dropdown"
                  ids={MENU_IDS.filter((id) => id !== "user.details" && id !== "user.delete")}
                />
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        ) : null}
      </FilterBar>

      <ContextMenu>
        <ContextMenuTrigger className="flex min-h-0 flex-1 flex-col">
          <ListTable label="Users" selection={selection}>
            <thead>
              <tr>
                <CheckTh selection={selection} />
                <Th sortKey="name" sort={sort} onSort={onSort}>
                  Name
                </Th>
                <Th sortKey="email" sort={sort} onSort={onSort}>
                  Email
                </Th>
                <Th sortKey="role" sort={sort} onSort={onSort}>
                  Role
                </Th>
                <Th sortKey="status" sort={sort} onSort={onSort}>
                  Status
                </Th>
                <Th sortKey="files" sort={sort} onSort={onSort} align="right">
                  Files
                </Th>
                <Th sortKey="storage" sort={sort} onSort={onSort} align="right">
                  Storage
                </Th>
                <Th sortKey="lastLogin" sort={sort} onSort={onSort}>
                  Last login
                </Th>
                <Th className="w-10" />
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <EmptyRow colSpan={colSpan}>
                  {users.isPending ? "Loading…" : "No users match."}
                </EmptyRow>
              ) : null}
              {rows.map((u) => (
                <ListRow
                  key={u.id}
                  rowKey={u.id}
                  selection={selection}
                  dimmed={u.disabled}
                  onActivate={() => {
                    selection.setOnly(u.id);
                    setDetailsOpen(true);
                  }}
                >
                  <CheckTd rowKey={u.id} selection={selection} />
                  <Td primary>
                    <span className="flex items-center gap-2">
                      <Avatar user={u} />
                      <span className="truncate">{userDisplayName(u)}</span>
                      {u.id === selfId ? (
                        <span className="font-normal text-muted-foreground">(you)</span>
                      ) : null}
                    </span>
                  </Td>
                  <Td>{u.email}</Td>
                  <Td>
                    <span
                      className={cn(
                        "rounded px-1.5 py-px text-[10.5px] font-medium",
                        u.isAdmin
                          ? "bg-accent text-accent-foreground"
                          : "bg-muted text-muted-foreground",
                      )}
                    >
                      {u.isAdmin ? "Admin" : "User"}
                    </span>
                  </Td>
                  <Td>
                    <StatusDot tone={u.disabled ? "off" : "ok"}>
                      {u.disabled ? "Disabled" : "Active"}
                    </StatusDot>
                  </Td>
                  <Td align="right">{u.fileCount}</Td>
                  <Td align="right">{fmtBytes(u.storageBytes ?? 0)}</Td>
                  <Td>{u.lastLoginAt ? fmtShortDate(u.lastLoginAt, now) : "Never"}</Td>
                  <Td className="py-0">
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        render={
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label={`Actions for ${u.email}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (!selection.isSelected(u.id) || selection.count > 1)
                                selection.setOnly(u.id);
                            }}
                          />
                        }
                      >
                        <HugeiconsIcon icon={MoreHorizontalIcon} strokeWidth={2} />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="min-w-52">
                        <CommandMenuItems as="dropdown" ids={MENU_IDS} />
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </Td>
                </ListRow>
              ))}
            </tbody>
          </ListTable>
        </ContextMenuTrigger>
        <ContextMenuContent className="min-w-52">
          {selection.count ? (
            <CommandMenuItems as="context" ids={MENU_IDS} />
          ) : (
            <span className="block px-2 py-1.5 text-xs text-muted-foreground">
              Right-click a user
            </span>
          )}
        </ContextMenuContent>
      </ContextMenu>

      <StatusBar
        left={
          <>
            <span>
              <b className="font-semibold text-foreground">{all.length}</b> users ·{" "}
              <b className="font-semibold text-foreground">{admins}</b> admins
            </span>
            <SelectedCount n={selection.count} />
          </>
        }
      />

      <UserDetailsPanel
        users={selected}
        selfId={selfId}
        onPatch={patchUsers}
        onDelete={(u) => setConfirmDelete(u)}
      />
      <DeleteUserDialog
        target={confirmDelete}
        onOpenChange={(o) => {
          if (!o) setConfirmDelete(null);
        }}
      />
    </>
  );
}
