import { FormEvent, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Alert02Icon,
  Loading03Icon,
  MailAdd02Icon,
} from "@hugeicons/core-free-icons";

import { ApiError, User, invites } from "@/api";
import { AuthShell } from "@/components/AuthShell";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type PeekState =
  | { kind: "loading" }
  | { kind: "ok"; expiresAt: number | null }
  | { kind: "error"; status: number; message: string };

export default function InviteAccept({
  onAuthed,
}: {
  onAuthed: (u: User) => void;
}) {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();

  const [peek, setPeek] = useState<PeekState>({ kind: "loading" });
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    if (!token) return;
    invites
      .peek(token)
      .then((r) => {
        if (alive) setPeek({ kind: "ok", expiresAt: r.expiresAt });
      })
      .catch((e: ApiError) => {
        if (!alive) return;
        setPeek({
          kind: "error",
          status: e.status,
          message: e.message || "invite unavailable",
        });
      });
    return () => {
      alive = false;
    };
  }, [token]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!token) return;
    if (password !== confirm) {
      setErr("passwords do not match");
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const user = await invites.accept(token, {
        email: email.trim(),
        password,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
      });
      onAuthed(user);
      navigate("/", { replace: true });
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "could not create account");
    } finally {
      setBusy(false);
    }
  }

  if (peek.kind === "loading") {
    return (
      <AuthShell title="Checking invite" description="Just a moment…">
        <div className="flex items-center justify-center py-6 text-muted-foreground">
          <HugeiconsIcon
            icon={Loading03Icon}
            strokeWidth={2}
            className="size-4 animate-spin"
          />
        </div>
      </AuthShell>
    );
  }

  if (peek.kind === "error") {
    return (
      <AuthShell
        title="Invite unavailable"
        description="This link can't be used to create an account."
      >
        <Alert variant="destructive">
          <HugeiconsIcon icon={Alert02Icon} strokeWidth={2} />
          <AlertDescription>{peek.message}</AlertDescription>
        </Alert>
        <Button
          variant="outline"
          className="mt-3 w-full"
          onClick={() => navigate("/login")}
        >
          Go to sign in
        </Button>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Create your account"
      description={
        peek.expiresAt
          ? `Invite expires ${new Date(peek.expiresAt).toLocaleString()}.`
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
            <HugeiconsIcon
              icon={Loading03Icon}
              strokeWidth={2}
              className="animate-spin"
            />
          ) : (
            <HugeiconsIcon icon={MailAdd02Icon} strokeWidth={2} />
          )}
          {busy ? "Creating…" : "Create account"}
        </Button>
      </form>
    </AuthShell>
  );
}
