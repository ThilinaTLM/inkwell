import { Alert02Icon, Loading03Icon, MailAdd02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useInvitePeek } from "@/data/auth";
import { AuthShell } from "@/features/auth/AuthShell";
import { type ApiError, invites, type MeResponse, type User } from "@/lib/api/client";
import { keys } from "@/lib/api/query-keys";
import { errorMessage } from "@/lib/errors";

export function InviteAcceptPage() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const peek = useInvitePeek(token);

  const accept = useMutation<
    User,
    ApiError,
    {
      email: string;
      password: string;
      firstName: string;
      lastName: string;
    }
  >({
    mutationFn: (body) => {
      if (!token) throw new Error("missing invite token");
      return invites.accept(token, body);
    },
    onSuccess: (user) => {
      qc.setQueryData<MeResponse>(keys.me, (prev) => ({
        ...(prev ?? ({} as MeResponse)),
        ...user,
        expiresAt: prev?.expiresAt ?? Number.MAX_SAFE_INTEGER,
      }));
    },
  });

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!token) return;
    if (password !== confirm) {
      setErr("passwords do not match");
      return;
    }
    setErr(null);
    try {
      await accept.mutateAsync({
        email: email.trim(),
        password,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
      });
      navigate("/", { replace: true });
    } catch (e) {
      setErr(errorMessage(e, "could not create account"));
    }
  }

  const busy = accept.isPending;

  if (peek.isPending) {
    return (
      <AuthShell title="Checking invite" description="Just a moment…">
        <div className="flex items-center justify-center py-6 text-muted-foreground">
          <HugeiconsIcon icon={Loading03Icon} strokeWidth={2} className="size-4 animate-spin" />
        </div>
      </AuthShell>
    );
  }

  if (peek.isError) {
    return (
      <AuthShell
        title="Invite unavailable"
        description="This link can't be used to create an account."
      >
        <Alert variant="destructive">
          <HugeiconsIcon icon={Alert02Icon} strokeWidth={2} />
          <AlertDescription>{errorMessage(peek.error, "invite unavailable")}</AlertDescription>
        </Alert>
        <Button variant="outline" className="mt-3 w-full" onClick={() => navigate("/login")}>
          Go to sign in
        </Button>
      </AuthShell>
    );
  }

  const expiresAt = peek.data?.expiresAt ?? null;

  return (
    <AuthShell
      title="Create your account"
      description={
        expiresAt
          ? `Invite expires ${new Date(expiresAt).toLocaleString()}.`
          : "Welcome to Inkwell."
      }
    >
      <form onSubmit={submit} className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="firstName">First name</Label>
            <Input
              id="firstName"
              type="text"
              autoComplete="given-name"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              disabled={busy}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="lastName">Last name</Label>
            <Input
              id="lastName"
              type="text"
              autoComplete="family-name"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              disabled={busy}
            />
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={busy}
            required
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            placeholder="At least 8 characters"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={busy}
            required
            minLength={8}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="confirm">Confirm password</Label>
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

        <Button
          type="submit"
          disabled={busy || !email || !password || password !== confirm}
          className="mt-1"
        >
          {busy ? (
            <HugeiconsIcon icon={Loading03Icon} strokeWidth={2} className="animate-spin" />
          ) : (
            <HugeiconsIcon icon={MailAdd02Icon} strokeWidth={2} />
          )}
          {busy ? "Creating…" : "Create account"}
        </Button>
      </form>
    </AuthShell>
  );
}
