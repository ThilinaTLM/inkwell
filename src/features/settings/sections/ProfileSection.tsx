// Settings → Profile: read-only identity + inline change-password form.

import { type FormEvent, useId, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useChangePassword } from "@/data/auth";
import type { User } from "@/lib/api/client";
import { errorMessage } from "@/lib/errors";
import { userDisplayName, userInitials } from "@/lib/user";
import { SettingsCard } from "../SettingsCard";

const schema = z
  .object({
    current: z.string().min(1, "Current password is required."),
    next: z.string().min(8, "Must be at least 8 characters."),
    confirm: z.string().min(1, "Confirm your new password."),
  })
  .refine((d) => d.next === d.confirm, {
    message: "New passwords do not match.",
    path: ["confirm"],
  });

type Field = "current" | "next" | "confirm";

export function ProfileSection({ user }: { user: User }) {
  const change = useChangePassword();
  const [values, setValues] = useState<Record<Field, string>>({
    current: "",
    next: "",
    confirm: "",
  });
  const [errors, setErrors] = useState<Partial<Record<Field | "form", string>>>({});
  const ids = { current: useId(), next: useId(), confirm: useId() };

  async function submit(e: FormEvent) {
    e.preventDefault();
    const parsed = schema.safeParse(values);
    if (!parsed.success) {
      const next: Partial<Record<Field, string>> = {};
      for (const issue of parsed.error.issues) {
        const k = issue.path[0] as Field;
        next[k] ??= issue.message;
      }
      setErrors(next);
      return;
    }
    setErrors({});
    try {
      await change.mutateAsync({ currentPassword: values.current, newPassword: values.next });
      toast.success("Password updated.");
      setValues({ current: "", next: "", confirm: "" });
    } catch (err) {
      setErrors({ form: errorMessage(err, "could not change password") });
    }
  }

  const field = (k: Field, label: string, autoComplete: string) => (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={ids[k]} className="text-[13px] font-medium">
        {label}
      </label>
      <Input
        id={ids[k]}
        type="password"
        autoComplete={autoComplete}
        value={values[k]}
        aria-invalid={errors[k] ? true : undefined}
        disabled={change.isPending}
        onChange={(e) => setValues((v) => ({ ...v, [k]: e.target.value }))}
      />
      {errors[k] ? <span className="text-xs text-destructive">{errors[k]}</span> : null}
    </div>
  );

  return (
    <SettingsCard
      id="profile"
      title="Profile"
      description="Ask an admin if your name or email needs changing."
    >
      <div className="mb-4 flex items-center gap-3.5">
        <span className="grid size-12 shrink-0 place-items-center rounded-full bg-accent-soft text-base font-semibold text-accent-text">
          {userInitials(user)}
        </span>
        <div className="min-w-0">
          <div className="truncate text-[15px] font-medium">{userDisplayName(user)}</div>
          <div className="truncate text-[13px] text-muted-foreground">{user.email}</div>
        </div>
        <span
          className={
            user.isAdmin
              ? "ml-auto rounded-full bg-accent-soft px-2.5 py-0.5 text-xs font-medium text-accent-text"
              : "ml-auto rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground"
          }
        >
          {user.isAdmin ? "Admin" : "Member"}
        </span>
      </div>

      <form
        onSubmit={submit}
        noValidate
        className="border-t border-border pt-4"
        aria-label="Change password"
      >
        <h3 className="mb-3 text-[13px] font-semibold">Change password</h3>
        <div className="grid max-w-md gap-3">
          {field("current", "Current password", "current-password")}
          {field("next", "New password (8+ characters)", "new-password")}
          {field("confirm", "Confirm new password", "new-password")}
        </div>
        <div className="mt-4 flex items-center gap-3">
          <Button type="submit" disabled={change.isPending}>
            {change.isPending ? "Updating…" : "Update password"}
          </Button>
          {errors.form ? <span className="text-xs text-destructive">{errors.form}</span> : null}
        </div>
      </form>
    </SettingsCard>
  );
}
