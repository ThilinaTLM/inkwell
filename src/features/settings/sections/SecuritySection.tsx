// Settings → Security: change password (ported from the old SecurityTab).

import { type FormEvent, useId, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useChangePassword } from "@/data/auth";
import { errorMessage } from "@/lib/errors";
import { SettingRow, SettingsGroup } from "../controls";

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

export function SecuritySection() {
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

  const field = (k: Field, label: string, help: string | undefined, autoComplete: string) => (
    <SettingRow label={label} help={help} htmlFor={ids[k]}>
      <div className="flex w-full max-w-[320px] flex-col gap-1">
        <Input
          id={ids[k]}
          type="password"
          autoComplete={autoComplete}
          value={values[k]}
          aria-invalid={errors[k] ? true : undefined}
          disabled={change.isPending}
          onChange={(e) => setValues((v) => ({ ...v, [k]: e.target.value }))}
          className="h-8"
        />
        {errors[k] ? <span className="text-xs text-destructive">{errors[k]}</span> : null}
      </div>
    </SettingRow>
  );

  return (
    <form onSubmit={submit} noValidate>
      <SettingsGroup
        title="Password"
        description="Use at least 8 characters. Sessions on other devices stay signed in."
      >
        {field("current", "Current password", undefined, "current-password")}
        {field("next", "New password", "At least 8 characters", "new-password")}
        {field("confirm", "Confirm new password", undefined, "new-password")}
        <div className="flex items-center gap-3 border-t border-border pt-3">
          {errors.form ? <span className="text-xs text-destructive">{errors.form}</span> : null}
          <span className="flex-1" />
          <Button type="submit" disabled={change.isPending}>
            {change.isPending ? "Updating…" : "Update password"}
          </Button>
        </div>
      </SettingsGroup>
    </form>
  );
}
