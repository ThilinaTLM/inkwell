import { Alert02Icon, Loading03Icon, MailAdd02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useRef, useState } from "react";
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
      qc.setQueryData<MeResponse | null>(keys.me, (prev) => ({
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
  const [mismatch, setMismatch] = useState(false);
  const confirmRef = useRef<HTMLInputElement>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!token || accept.isPending) return;
    if (password !== confirm) {
      setMismatch(true);
      confirmRef.current?.select();
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
  // Show the mismatch hint live once both fields have content.
  const showMismatch =
    mismatch || (confirm.length >= password.length && confirm !== password && confirm.length > 0);

  return (
    <AuthShell
      title="You’re invited"
      description="Create your Inkwell account."
      footer={
        expiresAt
          ? `Invite expires ${new Date(expiresAt).toLocaleString()}.`
          : "Welcome to Inkwell."
      }
    >
      <form onSubmit={submit} className="flex flex-col gap-3" aria-busy={busy}>
        <div className="grid grid-cols-2 gap-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="firstName">First name</Label>
            <Input
              id="firstName"
              name="firstName"
              type="text"
              autoFocus
              autoComplete="given-name"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              readOnly={busy}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="lastName">Last name</Label>
            <Input
              id="lastName"
              name="lastName"
              type="text"
              autoComplete="family-name"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              readOnly={busy}
            />
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            name="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            spellCheck={false}
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            readOnly={busy}
            required
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            placeholder="At least 8 characters"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              setMismatch(false);
            }}
            readOnly={busy}
            required
            minLength={8}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="confirm">Confirm password</Label>
          <Input
            ref={confirmRef}
            id="confirm"
            name="confirm"
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => {
              setConfirm(e.target.value);
              setMismatch(false);
            }}
            readOnly={busy}
            required
            minLength={8}
            aria-invalid={showMismatch}
            aria-describedby={showMismatch ? "confirm-error" : undefined}
          />
          {showMismatch ? (
            <p id="confirm-error" role="alert" className="text-xs text-destructive">
              Passwords do not match.
            </p>
          ) : null}
        </div>

        {err ? (
          <p role="alert" className="text-xs text-destructive">
            {err}
          </p>
        ) : null}

        <Button type="submit" size="lg" disabled={busy} className="mt-2 w-full">
          {busy ? (
            <HugeiconsIcon icon={Loading03Icon} strokeWidth={2} className="animate-spin" />
          ) : (
            <HugeiconsIcon icon={MailAdd02Icon} strokeWidth={2} />
          )}
          {busy ? "Creating…" : "Create account"}
          {busy ? null : (
            <kbd
              aria-hidden
              className="ml-1 rounded border border-primary-foreground/40 px-1 font-sans text-[0.7rem] leading-4"
            >
              ↵
            </kbd>
          )}
        </Button>
      </form>
    </AuthShell>
  );
}
