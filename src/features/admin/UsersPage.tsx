// Users (admin; wireframe screens 18–19) at /users/:tab? — one page with
// Users and Invites tabs, explorer-style dense tables, a details panel for
// users, and an "Invite user" popover that ends with the link on the
// clipboard. The API stays under /api/admin/*.

import { UserMultipleIcon } from "@hugeicons/core-free-icons";
import { useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { PageFrame, PageToolbar, ToolbarSearch } from "@/components/shell/page";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAdminUsers, useInvites } from "@/data/admin";
import { useMe } from "@/data/auth";
import { cn } from "@/lib/utils";
import { InvitePopover } from "./InvitePopover";
import { type InviteStatusFilter, InvitesTab } from "./InvitesTab";
import { type UserRoleFilter, type UserStatusFilter, UsersTab } from "./UsersTab";

export function UsersPage() {
  const { tab = "users" } = useParams<{ tab?: string }>();
  const me = useMe();
  const users = useAdminUsers();
  const invites = useInvites();
  const [q, setQ] = useState("");
  const [role, setRole] = useState<UserRoleFilter>("all");
  const [userStatus, setUserStatus] = useState<UserStatusFilter>("all");
  const [inviteStatus, setInviteStatus] = useState<InviteStatusFilter>("pending");
  const [flashToken, setFlashToken] = useState<string | null>(null);

  if (tab !== "users" && tab !== "invites") return <Navigate to="/users" replace />;
  if (!me.data) return null;

  const pending = (invites.data ?? []).filter((i) => i.status === "pending").length;

  return (
    <PageFrame>
      <PageToolbar
        icon={UserMultipleIcon}
        title="Users"
        right={
          <>
            <ToolbarSearch
              value={q}
              onChange={setQ}
              placeholder={tab === "users" ? "Search name or email" : "Search invites"}
              className="w-[240px]"
            />
            <InvitePopover onCreated={(token) => setFlashToken(token)} />
          </>
        }
      >
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="outline" size="sm" className="h-7" />}>
            Filters
            {(tab === "users"
              ? Number(role !== "all") + Number(userStatus !== "all")
              : Number(inviteStatus !== "all")) > 0 ? (
              <span className="rounded-full bg-primary px-1.5 text-[10px] text-primary-foreground">
                {tab === "users"
                  ? Number(role !== "all") + Number(userStatus !== "all")
                  : Number(inviteStatus !== "all")}
              </span>
            ) : null}
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-48">
            {tab === "users" ? (
              <>
                <DropdownMenuLabel>Role</DropdownMenuLabel>
                <DropdownMenuRadioGroup
                  value={role}
                  onValueChange={(value) => setRole(value as UserRoleFilter)}
                >
                  <DropdownMenuRadioItem value="all">All</DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="admin">Admins</DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="user">Users</DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
                <DropdownMenuLabel>Status</DropdownMenuLabel>
                <DropdownMenuRadioGroup
                  value={userStatus}
                  onValueChange={(value) => setUserStatus(value as UserStatusFilter)}
                >
                  <DropdownMenuRadioItem value="all">All</DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="active">Active</DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="disabled">Disabled</DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
              </>
            ) : (
              <>
                <DropdownMenuLabel>Status</DropdownMenuLabel>
                <DropdownMenuRadioGroup
                  value={inviteStatus}
                  onValueChange={(value) => setInviteStatus(value as InviteStatusFilter)}
                >
                  <DropdownMenuRadioItem value="all">All</DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="pending">Pending</DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="used">Used</DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="expired">Expired</DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="revoked">Revoked</DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </PageToolbar>
      <div
        role="tablist"
        aria-label="Users sections"
        className="flex shrink-0 gap-0.5 border-b border-border px-3"
      >
        <TabLink
          to="/users"
          active={tab === "users"}
          label="Users"
          count={`${users.data?.length ?? "…"}`}
          onClick={() => setQ("")}
        />
        <TabLink
          to="/users/invites"
          active={tab === "invites"}
          label="Invites"
          count={`${pending} pending`}
          onClick={() => setQ("")}
        />
      </div>
      {tab === "users" ? (
        <UsersTab selfId={me.data.id} query={q} role={role} status={userStatus} />
      ) : (
        <InvitesTab
          query={q}
          flashToken={flashToken}
          status={inviteStatus}
          onStatusChange={setInviteStatus}
        />
      )}
    </PageFrame>
  );
}

function TabLink({
  to,
  active,
  label,
  count,
  onClick,
}: {
  to: string;
  active: boolean;
  label: string;
  count: string;
  onClick: () => void;
}) {
  return (
    <Link
      to={to}
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        "border-b-2 border-transparent px-3 pt-3 pb-2.5 text-[12.5px] font-semibold text-muted-foreground outline-none hover:text-foreground focus-visible:text-foreground",
        active && "border-primary text-foreground",
      )}
    >
      {label}
      <i className="ml-1 font-medium text-muted-foreground not-italic">{count}</i>
    </Link>
  );
}
