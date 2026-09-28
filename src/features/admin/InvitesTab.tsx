// Invites tab (wireframe screen 19): pending / used / expired / revoked
// invites in one filterable table, with a note column, copy + revoke row
// actions, bulk revoke, and a flash on the freshly created row.
//
// Page commands: invite.copy (⌘C) · invite.revoke (Delete, ⌘⌫)

import { Cancel01Icon, Copy01Icon } from "@hugeicons/core-free-icons";
import { useQueryClient } from "@tanstack/react-query";
import { type Dispatch, type SetStateAction, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { StatusBar } from "@/components/shell/page";
import { ContextMenu, ContextMenuContent, ContextMenuTrigger } from "@/components/ui/context-menu";
import { useInvites } from "@/data/admin";
import { confirmDialog } from "@/features/dialogs/dialogStore";
import { fmtShortDate } from "@/features/library/helpers";
import {
  CheckTd,
  CheckTh,
  EmptyRow,
  ListRow,
  ListTable,
  RowActions,
  RowIconButton,
  StatusDot,
  type StatusTone,
  Td,
  Th,
} from "@/features/library/ListTable";
import { SelectedCount, useToggleSort } from "@/features/library/parts";
import { useListSelection, useLocalSelState } from "@/features/library/useListSelection";
import { admin, type Invite, type InviteStatus } from "@/lib/api/client";
import { keys } from "@/lib/api/query-keys";
import { copyToClipboard } from "@/lib/clipboard";
import { CommandMenuItems } from "@/lib/commands/CommandMenuItems";
import { type Command, useRegisterCommands } from "@/lib/commands/registry";
import { inviteUrl } from "@/lib/url";
import { cn } from "@/lib/utils";

export type InviteStatusFilter = "all" | InviteStatus;
type SortKey = "created" | "expires" | "status";

const TONE: Record<InviteStatus, StatusTone> = {
  pending: "pending",
  used: "ok",
  expired: "muted",
  revoked: "off",
};
const LABEL: Record<InviteStatus, string> = {
  pending: "Pending",
  used: "Used",
  expired: "Expired",
  revoked: "Revoked",
};

const shortToken = (t: string) => `${t.slice(0, 4)}…${t.slice(-2)}`;

async function copyInvite(token: string) {
  const ok = await copyToClipboard(inviteUrl(token));
  if (ok) toast.success("Invite link copied");
  else toast.error("Couldn't access the clipboard", { description: inviteUrl(token) });
}

export function InvitesTab({
  query,
  flashToken,
  status,
  onStatusChange,
}: {
  query: string;
  flashToken: string | null;
  status: InviteStatusFilter;
  onStatusChange: Dispatch<SetStateAction<InviteStatusFilter>>;
}) {
  const qc = useQueryClient();
  const invites = useInvites();
  const [sort, onSort] = useToggleSort<SortKey>({ key: "created", dir: "desc" });
  const [flash, setFlash] = useState<string | null>(null);
  const now = Date.now();
  const all = invites.data ?? [];

  useEffect(() => {
    if (!flashToken) return;
    onStatusChange((current) => (current === "all" || current === "pending" ? current : "pending"));
    setFlash(flashToken);
    const t = window.setTimeout(() => setFlash(null), 1600);
    return () => window.clearTimeout(t);
  }, [flashToken, onStatusChange]);

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const list = all.filter(
      (i) =>
        (status === "all" || i.status === status) &&
        (!needle ||
          `${i.token} ${i.note ?? ""} ${i.usedByEmail ?? ""} ${i.createdByEmail ?? ""}`
            .toLowerCase()
            .includes(needle)),
    );
    const sign = sort.dir === "asc" ? 1 : -1;
    return list.sort((a, b) => {
      if (sort.key === "expires")
        return (
          sign *
          ((a.expiresAt ?? Number.MAX_SAFE_INTEGER) - (b.expiresAt ?? Number.MAX_SAFE_INTEGER))
        );
      if (sort.key === "status") return sign * a.status.localeCompare(b.status);
      return sign * (a.createdAt - b.createdAt);
    });
  }, [all, query, status, sort]);

  const order = useMemo(() => rows.map((i) => i.token), [rows]);
  const selection = useListSelection(order, useLocalSelState());
  const byToken = useMemo(() => new Map(all.map((i) => [i.token, i])), [all]);
  const selected = selection.selectedKeys
    .map((t) => byToken.get(t))
    .filter((i): i is Invite => !!i);

  async function revoke(list: Invite[]) {
    const pending = list.filter((i) => i.status === "pending");
    if (!pending.length) return;
    const ok = await confirmDialog({
      title: pending.length === 1 ? "Revoke this invite?" : `Revoke ${pending.length} invites?`,
      description: "The link stops working immediately. This can't be undone.",
      confirmLabel: "Revoke",
    });
    if (!ok) return;
    const results = await Promise.allSettled(pending.map((i) => admin.revokeInvite(i.token)));
    qc.invalidateQueries({ queryKey: keys.admin.invites() });
    const failed = results.filter((r) => r.status === "rejected").length;
    if (failed) toast.error(`${failed} invite(s) could not be revoked`);
    else
      toast.success(pending.length === 1 ? "Invite revoked" : `Revoked ${pending.length} invites`);
  }

  const selRef = useRef(selected);
  selRef.current = selected;
  const onPage = (route: string) => route.startsWith("/users/invites");
  // biome-ignore lint/correctness/useExhaustiveDependencies: page commands read live state through refs
  const commands = useMemo<Command[]>(
    () => [
      {
        id: "invite.copy",
        label: "Copy invite link",
        icon: Copy01Icon,
        keys: ["mod+c"],
        group: "file",
        palette: false,
        when: (c) => onPage(c.route) && selRef.current.length === 1,
        disabledReason: () =>
          selRef.current[0]?.status !== "pending" ? "Only pending invites work" : null,
        run: () => void copyInvite(selRef.current[0].token),
      },
      {
        id: "invite.revoke",
        label: () =>
          selRef.current.length > 1 ? `Revoke ${selRef.current.length} invites…` : "Revoke invite…",
        icon: Cancel01Icon,
        keys: ["delete", "mod+backspace"],
        group: "organise",
        palette: false,
        destructive: true,
        when: (c) => onPage(c.route) && selRef.current.length > 0,
        disabledReason: () =>
          selRef.current.some((i) => i.status === "pending")
            ? null
            : "Only pending invites can be revoked",
        run: () => void revoke(selRef.current),
      },
    ],
    [],
  );
  useRegisterCommands(commands, [commands]);

  const count = (s: InviteStatus) => all.filter((i) => i.status === s).length;
  const colSpan = 9;

  return (
    <>
      <ContextMenu>
        <ContextMenuTrigger className="flex min-h-0 flex-1 flex-col">
          <ListTable label="Invites" selection={selection}>
            <thead>
              <tr>
                <CheckTh selection={selection} />
                <Th>Invite</Th>
                <Th>Note</Th>
                <Th sortKey="status" sort={sort} onSort={onSort}>
                  Status
                </Th>
                <Th sortKey="created" sort={sort} onSort={onSort}>
                  Created
                </Th>
                <Th sortKey="expires" sort={sort} onSort={onSort}>
                  Expires
                </Th>
                <Th>Used by</Th>
                <Th>Created by</Th>
                <Th className="w-[80px]" />
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <EmptyRow colSpan={colSpan}>
                  {invites.isPending
                    ? "Loading…"
                    : status === "pending" && !query
                      ? "No pending invites — press Invite user."
                      : "No invites match."}
                </EmptyRow>
              ) : null}
              {rows.map((i) => (
                <ListRow
                  key={i.token}
                  rowKey={i.token}
                  selection={selection}
                  dimmed={i.status === "expired" || i.status === "revoked"}
                  className={cn(flash === i.token && "[&>td]:animate-pulse [&>td]:bg-accent")}
                >
                  <CheckTd rowKey={i.token} selection={selection} />
                  <Td primary className="font-mono font-medium">
                    {shortToken(i.token)}
                  </Td>
                  <Td className="max-w-[260px]" title={i.note ?? undefined}>
                    {i.note || "—"}
                  </Td>
                  <Td>
                    <StatusDot tone={TONE[i.status]}>{LABEL[i.status]}</StatusDot>
                  </Td>
                  <Td>{fmtShortDate(i.createdAt, now)}</Td>
                  <Td>
                    {i.status === "used" || i.status === "revoked"
                      ? "—"
                      : i.expiresAt
                        ? fmtShortDate(i.expiresAt, now)
                        : "Never"}
                  </Td>
                  <Td>{i.usedByEmail ?? "—"}</Td>
                  <Td>{i.createdByEmail ?? "—"}</Td>
                  <Td className="py-0">
                    {i.status === "pending" ? (
                      <RowActions always>
                        <RowIconButton
                          label="Copy invite link"
                          icon={Copy01Icon}
                          onClick={() => void copyInvite(i.token)}
                        />
                        <RowIconButton
                          label="Revoke invite"
                          icon={Cancel01Icon}
                          destructive
                          onClick={() => void revoke([i])}
                        />
                      </RowActions>
                    ) : null}
                  </Td>
                </ListRow>
              ))}
            </tbody>
          </ListTable>
        </ContextMenuTrigger>
        <ContextMenuContent className="min-w-48">
          {selection.count ? (
            <CommandMenuItems as="context" ids={["invite.copy", "-", "invite.revoke"]} />
          ) : (
            <span className="block px-2 py-1.5 text-xs text-muted-foreground">
              Right-click an invite
            </span>
          )}
        </ContextMenuContent>
      </ContextMenu>
      <StatusBar
        left={
          <>
            <span>
              <b className="font-semibold text-foreground">{count("pending")}</b> pending ·{" "}
              <b className="font-semibold text-foreground">{count("used")}</b> used ·{" "}
              <b className="font-semibold text-foreground">{count("expired")}</b> expired
            </span>
            <SelectedCount n={selection.count} />
          </>
        }
      />
    </>
  );
}
