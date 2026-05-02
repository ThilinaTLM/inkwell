import { FormEvent, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Loading03Icon,
  SecurityCheckIcon,
  Shield01Icon,
  UserCircleIcon,
} from "@hugeicons/core-free-icons";
import { toast } from "sonner";

import { useChangePassword, useMe } from "@/features/auth/hooks";
import { Topbar } from "@/components/Topbar";
import { errorMessage } from "@/lib/errors";
import { userDisplayName } from "@/lib/user";
import { PaperSurface } from "@/components/PaperSurface";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";

export default function AccountPage() {
  const me = useMe();
  const changePassword = useChangePassword();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    if (next !== confirm) {
      setErr("New passwords do not match.");
      return;
    }
    if (next.length < 8) {
      setErr("New password must be at least 8 characters.");
      return;
    }
    try {
      await changePassword.mutateAsync({
        currentPassword: current,
        newPassword: next,
      });
      toast.success("Password updated.");
      setCurrent("");
      setNext("");
      setConfirm("");
    } catch (e) {
      setErr(errorMessage(e, "could not change password"));
    }
  }

  const busy = changePassword.isPending;
  const user = me.data;
  if (!user) return null; // App-level boot splash covers this; safety net.
  const fullName = userDisplayName(user);

  return (
    <PaperSurface variant="page" className="flex flex-col">
      <Topbar user={user} />

      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-8">
        <header className="mb-6">
          <h1 className="font-heading text-3xl text-ink">Account</h1>
          <p className="mt-1 font-hand text-base text-ink-soft">
            Manage your profile and security settings.
          </p>
        </header>

        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <HugeiconsIcon icon={UserCircleIcon} strokeWidth={1.8} className="size-5 text-ink-soft" />
                Profile
              </CardTitle>
              <CardDescription>Read-only for now.</CardDescription>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-2 text-xs/relaxed">
                <dt className="text-muted-foreground">Name</dt>
                <dd>{fullName}</dd>
                <dt className="text-muted-foreground">Email</dt>
                <dd className="font-mono text-[0.6875rem]">{user.email}</dd>
                <dt className="text-muted-foreground">Role</dt>
                <dd>
                  {user.isAdmin ? (
                    <Badge variant="outline" className="gap-1">
                      <HugeiconsIcon icon={Shield01Icon} strokeWidth={2} />
                      Admin
                    </Badge>
                  ) : (
                    <Badge variant="secondary">User</Badge>
                  )}
                </dd>
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <HugeiconsIcon icon={SecurityCheckIcon} strokeWidth={1.8} className="size-5 text-ink-soft" />
                Change password
              </CardTitle>
              <CardDescription>
                Use at least 8 characters. Sessions on other devices stay
                signed in.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={submit} className="flex flex-col gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="current">Current password</Label>
                  <Input
                    id="current"
                    type="password"
                    autoComplete="current-password"
                    value={current}
                    onChange={(e) => setCurrent(e.target.value)}
                    disabled={busy}
                    required
                  />
                </div>

                <Separator className="my-1" />

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="new">New password</Label>
                  <Input
                    id="new"
                    type="password"
                    autoComplete="new-password"
                    placeholder="At least 8 characters"
                    value={next}
                    onChange={(e) => setNext(e.target.value)}
                    disabled={busy}
                    required
                    minLength={8}
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="confirm">Confirm new password</Label>
                  <Input
                    id="confirm"
                    type="password"
                    autoComplete="new-password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    disabled={busy}
                    required
                    minLength={8}
                  />
                </div>

                {err && (
                  <Alert variant="destructive">
                    <AlertDescription>{err}</AlertDescription>
                  </Alert>
                )}

                <div className="flex justify-end pt-1">
                  <Button
                    type="submit"
                    disabled={busy || !current || !next || !confirm}
                  >
                    {busy && (
                      <HugeiconsIcon
                        icon={Loading03Icon}
                        strokeWidth={2}
                        className="animate-spin"
                      />
                    )}
                    {busy ? "Updating…" : "Update password"}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      </main>
    </PaperSurface>
  );
}
