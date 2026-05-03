// "Type DELETE foo@bar to confirm" dialog for permanently removing a
// user. The phrase requirement makes accidental clicks impossible and
// is per-user (`DELETE {email}`) so muscle memory from one row can't
// fire on another.

import { type ChangeEvent, useEffect, useState } from "react";
import { toast } from "sonner";

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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useDeleteAdminUser } from "@/features/admin/hooks";
import type { AdminUser } from "@/lib/api/client";
import { errorMessage } from "@/lib/errors";

interface DeleteUserDialogProps {
  target: AdminUser | null;
  onOpenChange: (open: boolean) => void;
  onDeleted?: (id: string) => void;
}

export function DeleteUserDialog({ target, onOpenChange, onDeleted }: DeleteUserDialogProps) {
  const [typed, setTyped] = useState("");
  const deleteUser = useDeleteAdminUser();
  const phrase = target ? `DELETE ${target.email}` : "";
  const matches = !!target && typed === phrase;

  useEffect(() => {
    if (!target) setTyped("");
  }, [target]);

  async function run() {
    if (!target || !matches) return;
    try {
      await deleteUser.mutateAsync(target.id);
      toast.success(`Deleted ${target.email}.`);
      onDeleted?.(target.id);
      onOpenChange(false);
    } catch (e) {
      toast.error(errorMessage(e, "delete failed"));
    }
  }

  const busy = deleteUser.isPending;

  return (
    <AlertDialog open={!!target} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete user</AlertDialogTitle>
          <AlertDialogDescription>
            This permanently deletes <strong>{target?.email}</strong>, all of their scenes (
            {target?.sceneCount}), and any share tokens they own. This cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="flex flex-col gap-2">
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
            onChange={(e: ChangeEvent<HTMLInputElement>) => setTyped(e.target.value)}
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
