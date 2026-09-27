// "Invite user" popover (wireframe screen 19): expiry chips + optional
// note → Create & copy link (⌘↵). Switches to the Invites tab and flashes
// the new row.
//
// PUBLIC CONTRACT
//   <InvitePopover onCreated?(token) />

import { Popover } from "@base-ui/react/popover";
import { Copy01Icon, MailAdd02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useId, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useCreateInvite } from "@/data/admin";
import { ChipGroup } from "@/features/settings/controls";
import { copyToClipboard } from "@/lib/clipboard";
import { isMacPlatform } from "@/lib/commands/keymap";
import { errorMessage } from "@/lib/errors";
import { inviteUrl } from "@/lib/url";

const EXPIRY: Array<{ value: string; label: string; hours: number | null }> = [
  { value: "1", label: "1 h", hours: 1 },
  { value: "24", label: "1 day", hours: 24 },
  { value: "168", label: "7 days", hours: 168 },
  { value: "720", label: "30 days", hours: 720 },
  { value: "never", label: "Never", hours: null },
];

export function InvitePopover({ onCreated }: { onCreated?: (token: string) => void }) {
  const [open, setOpen] = useState(false);
  const [expiry, setExpiry] = useState("168");
  const [note, setNote] = useState("");
  const create = useCreateInvite();
  const navigate = useNavigate();
  const noteId = useId();

  async function submit() {
    if (create.isPending) return;
    try {
      const hours = EXPIRY.find((e) => e.value === expiry)?.hours ?? null;
      const inv = await create.mutateAsync({ expiresInHours: hours, note: note.trim() || null });
      const url = inv.url || inviteUrl(inv.token);
      const ok = await copyToClipboard(url);
      if (ok) toast.success("Invite link copied", { description: note.trim() || undefined });
      else toast.success("Invite created", { description: url });
      setOpen(false);
      setNote("");
      setExpiry("168");
      onCreated?.(inv.token);
      navigate("/users/invites");
    } catch (e) {
      toast.error(errorMessage(e, "could not create invite"));
    }
  }

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger render={<Button size="sm" />}>
        <HugeiconsIcon icon={MailAdd02Icon} strokeWidth={2} />
        Invite user
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner sideOffset={6} align="end" className="z-50">
          <Popover.Popup
            onKeyDown={(e) => {
              if (e.key === "Enter" && (isMacPlatform ? e.metaKey : e.ctrlKey)) {
                e.preventDefault();
                void submit();
              }
            }}
            className="w-[330px] origin-(--transform-origin) rounded-lg bg-popover p-3.5 text-popover-foreground shadow-[0_18px_40px_-14px_rgba(28,24,20,0.35)] ring-1 ring-border outline-none data-ending-style:scale-[0.98] data-ending-style:opacity-0 data-starting-style:scale-[0.98] data-starting-style:opacity-0 transition-[scale,opacity] duration-100"
          >
            <Popover.Title className="text-sm font-semibold">Invite a user</Popover.Title>
            <Popover.Description className="mt-0.5 mb-2.5 text-xs text-muted-foreground">
              Anyone with the link can create an account.
            </Popover.Description>
            <div className="mb-1.5 text-xs text-muted-foreground">Link expires in</div>
            <ChipGroup
              ariaLabel="Invite expiry"
              value={expiry}
              onChange={setExpiry}
              options={EXPIRY}
            />
            <label htmlFor={noteId} className="mt-2.5 mb-1.5 block text-xs text-muted-foreground">
              Note (optional)
            </label>
            <Input
              id={noteId}
              value={note}
              maxLength={200}
              onChange={(e) => setNote(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.metaKey && !e.ctrlKey) {
                  e.preventDefault();
                  void submit();
                }
              }}
              placeholder="e.g. For Maya’s contractor"
              className="h-8 text-[13px]"
            />
            <div className="mt-3 flex justify-end">
              <Button size="sm" onClick={() => void submit()} disabled={create.isPending}>
                <HugeiconsIcon icon={Copy01Icon} strokeWidth={2} />
                {create.isPending ? "Creating…" : "Create & copy link"}
              </Button>
            </div>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
