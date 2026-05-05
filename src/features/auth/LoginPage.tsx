import { Loading03Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { type FormEvent, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useLogin } from "@/data/auth";
import { AuthShell } from "@/features/auth/AuthShell";
import { errorMessage } from "@/lib/errors";

export function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = params.get("next") || "/";
  const login = useLogin();

  async function submit(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    try {
      await login.mutateAsync({ email: email.trim(), password });
      navigate(next, { replace: true });
    } catch (e) {
      setErr(errorMessage(e, "login failed"));
    }
  }

  const busy = login.isPending;

  return (
    <AuthShell
      title="Sign in"
      description="Enter your credentials to continue."
      footer="New here? You'll need an invite link from an admin."
    >
      <form onSubmit={submit} className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            autoFocus
            autoComplete="username"
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
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={busy}
            required
          />
        </div>

        {err && (
          <Alert variant="destructive">
            <AlertDescription>{err}</AlertDescription>
          </Alert>
        )}

        <Button type="submit" disabled={busy || !email || !password} className="mt-1">
          {busy && <HugeiconsIcon icon={Loading03Icon} strokeWidth={2} className="animate-spin" />}
          {busy ? "Signing in…" : "Sign in"}
        </Button>
      </form>
    </AuthShell>
  );
}
