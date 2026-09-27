// Users (admin; wireframe screens 18–19) at /users/:tab? — one page with
// Users and Invites tabs, explorer-style dense tables, a details panel for
// users, and an "Invite user" popover that ends with the link on the
// clipboard. The API stays under /api/admin/*.

import { UserMultipleIcon } from "@hugeicons/core-free-icons";
import { useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { PageFrame, PageToolbar, ToolbarSearch } from "@/components/shell/page";
import { useAdminUsers, useInvites } from "@/data/admin";
import { useMe } from "@/data/auth";
import { cn } from "@/lib/utils";
import { InvitePopover } from "./InvitePopover";
import { InvitesTab } from "./InvitesTab";
import { UsersTab } from "./UsersTab";

export function UsersPage() {
  const { tab = "users" } = useParams<{ tab?: string }>();
  const me = useMe();
  const users = useAdminUsers();
  const invites = useInvites();
  const [q, setQ] = useState("");
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
      />
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
        <UsersTab selfId={me.data.id} query={q} />
      ) : (
        <InvitesTab query={q} flashToken={flashToken} />
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
