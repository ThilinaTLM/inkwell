// Admin → Invites tab.
//
// Generate single-use invite links with a chosen expiry, copy them to
// the clipboard, and revoke pending invites.

import {
  Copy01Icon,
  Delete02Icon,
  Loading03Icon,
  MailAdd02Icon,
  MoreHorizontalIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { ElevatedCard } from "@/components/ElevatedCard";
import { SectionHeading } from "@/components/SectionHeading";
import { Button } from "@/components/ui/button";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useCreateInvite, useInvites, useRevokeInvite } from "@/features/admin/hooks";
import { copyToClipboard } from "@/lib/clipboard";
import { errorMessage } from "@/lib/errors";
import { fmtDateTime } from "@/lib/format";
import { inviteUrl } from "@/lib/url";
import { StatusPill } from "./StatusPill";
import { TableSkeleton } from "./TableSkeleton";

const EXPIRY_OPTIONS: {
  label: string;
  value: string;
  hours: number | null;
}[] = [
  { label: "1 hour", value: "1", hours: 1 },
  { label: "1 day", value: "24", hours: 24 },
  { label: "7 days", value: "168", hours: 24 * 7 },
  { label: "30 days", value: "720", hours: 24 * 30 },
  { label: "Never", value: "never", hours: null },
];

export function InvitesPanel() {
  const invitesQuery = useInvites();
  const createInvite = useCreateInvite();
  const revokeInvite = useRevokeInvite();

  const [expiryValue, setExpiryValue] = useState("168");
  const [latest, setLatest] = useState<{ url: string; token: string } | null>(null);

  async function generate() {
    const opt = EXPIRY_OPTIONS.find((o) => o.value === expiryValue);
    try {
      const inv = await createInvite.mutateAsync(opt?.hours ?? null);
      const absolute = inv.url.startsWith("http") ? inv.url : `${window.location.origin}${inv.url}`;
      setLatest({ url: absolute, token: inv.token });
      const copied = await copyToClipboard(absolute);
      toast.success(copied ? "Invite created and copied to clipboard." : "Invite created.");
    } catch (e) {
      toast.error(errorMessage(e, "could not create invite"));
    }
  }

  async function copy(url: string) {
    const ok = await copyToClipboard(url);
    if (ok) toast.success("Copied to clipboard.");
    else toast.error("Could not copy.");
  }

  async function revoke(token: string) {
    try {
      await revokeInvite.mutateAsync(token);
      toast.success("Invite revoked.");
    } catch (e) {
      toast.error(errorMessage(e, "revoke failed"));
    }
  }

  const sorted = useMemo(
    () =>
      invitesQuery.data ? [...invitesQuery.data].sort((a, b) => b.createdAt - a.createdAt) : null,
    [invitesQuery.data],
  );
  const busy = createInvite.isPending || revokeInvite.isPending;

  return (
    <div className="flex flex-col gap-6">
      <ElevatedCard>
        <SectionHeading label="Generate invite link" />
        <div className="px-6 pb-6">
          <p className="mb-4 text-sm text-muted-foreground">
            Single-use links new members exchange for an account.
          </p>

          <div className="flex flex-wrap items-end gap-2">
            <div className="flex flex-col gap-2">
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
              {createInvite.isPending ? (
                <HugeiconsIcon icon={Loading03Icon} strokeWidth={2} className="animate-spin" />
              ) : (
                <HugeiconsIcon icon={MailAdd02Icon} strokeWidth={2} />
              )}
              Create invite link
            </Button>
          </div>

          {latest && (
            <div className="mt-4 flex flex-col gap-2">
              <Label htmlFor="invite-url">Latest invite</Label>
              <div className="flex gap-1.5">
                <Input
                  id="invite-url"
                  readOnly
                  value={latest.url}
                  onFocus={(e) => e.currentTarget.select()}
                  className="font-mono text-xs"
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
        </div>
      </ElevatedCard>

      <ElevatedCard>
        <SectionHeading label="Invites" count={sorted?.length} />
        <div className="px-6 pb-6">
          <p className="mb-4 text-sm text-muted-foreground">
            All invites issued from this workspace.
          </p>

          {invitesQuery.isPending ? (
            <TableSkeleton rows={3} cols={5} />
          ) : !sorted || sorted.length === 0 ? (
            <div className="text-center text-sm text-muted-foreground">No invites yet.</div>
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
                      <code className="font-mono text-xs">{inv.token.slice(0, 10)}…</code>
                    </TableCell>
                    <TableCell>
                      <StatusPill status={inv.status} />
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {fmtDateTime(inv.createdAt)}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {inv.expiresAt ? fmtDateTime(inv.expiresAt) : "Never"}
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
                            <HugeiconsIcon icon={MoreHorizontalIcon} strokeWidth={2} />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => copy(inviteUrl(inv.token))}>
                              <HugeiconsIcon icon={Copy01Icon} strokeWidth={2} />
                              Copy link
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              variant="destructive"
                              onClick={() => revoke(inv.token)}
                            >
                              <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} />
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
        </div>
      </ElevatedCard>
    </div>
  );
}
