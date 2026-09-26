import { Loading03Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { type FormEvent, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
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
  const passwordRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = params.get("next") || "/";
  const login = useLogin();

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (login.isPending) return;
    setErr(null);
    try {
      await login.mutateAsync({ email: email.trim(), password });
      navigate(next, { replace: true });
    } catch (e) {
      setErr(errorMessage(e, "login failed"));
      // Keyboard flow: land back on the password so a retry is one
      // retype + ↵ away.
      requestAnimationFrame(() => passwordRef.current?.select());
    }
  }

  const busy = login.isPending;

  return (
    <AuthShell
      title="Welcome back"
      description="Sign in to your drawings."
      footer="Forgot your password or new here? Ask an admin for an invite link."
    >
      <form onSubmit={submit} className="flex flex-col gap-3" aria-busy={busy}>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            name="email"
            type="email"
            inputMode="email"
            autoFocus
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
            ref={passwordRef}
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              if (err) setErr(null);
            }}
            readOnly={busy}
            required
            aria-invalid={!!err}
            aria-describedby={err ? "login-error" : undefined}
          />
          {err ? (
            <p id="login-error" role="alert" className="text-xs text-destructive">
              {err}
            </p>
          ) : null}
        </div>

        <Button type="submit" size="lg" disabled={busy} className="mt-2 w-full">
          {busy && <HugeiconsIcon icon={Loading03Icon} strokeWidth={2} className="animate-spin" />}
          {busy ? "Signing in…" : "Sign in"}
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
