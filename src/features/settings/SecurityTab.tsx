// SecurityTab — change-password form, lifted from the old AccountPage
// without behavioural change. The shared TextFormField stays in
// `features/auth/` since the login / invite flows still consume it.

import { Loading03Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useForm } from "@tanstack/react-form";
import { useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { ElevatedCard } from "@/components/ElevatedCard";
import { SectionHeading } from "@/components/SectionHeading";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { useChangePassword } from "@/data/auth";
import { TextFormField } from "@/features/auth/TextFormField";
import { errorMessage } from "@/lib/errors";

const passwordSchema = z
  .object({
    current: z.string().min(1, "Current password is required."),
    next: z.string().min(8, "Must be at least 8 characters."),
    confirm: z.string().min(1, "Confirm your new password."),
  })
  .refine((data) => data.next === data.confirm, {
    message: "New passwords do not match.",
    path: ["confirm"],
  });

export function SecurityTab() {
  const changePassword = useChangePassword();
  const [submitError, setSubmitError] = useState<string | null>(null);

  const form = useForm({
    defaultValues: {
      current: "",
      next: "",
      confirm: "",
    },
    validators: {
      onChange: passwordSchema,
    },
    onSubmit: async ({ value }) => {
      setSubmitError(null);
      try {
        await changePassword.mutateAsync({
          currentPassword: value.current,
          newPassword: value.next,
        });
        toast.success("Password updated.");
        form.reset();
      } catch (e) {
        setSubmitError(errorMessage(e, "could not change password"));
      }
    },
  });

  const busy = changePassword.isPending;

  return (
    <ElevatedCard>
      <SectionHeading label="Security" />
      <form
        onSubmit={(e) => {
          e.preventDefault();
          e.stopPropagation();
          void form.handleSubmit();
        }}
        className="px-6 pb-6"
      >
        <p className="mb-4 text-sm text-muted-foreground">
          Use at least 8 characters. Sessions on other devices stay signed in.
        </p>

        <div className="flex flex-col gap-4">
          <form.Field name="current">
            {(field) => (
              <TextFormField
                field={field}
                label="Current password"
                type="password"
                autoComplete="current-password"
                disabled={busy}
                required
              />
            )}
          </form.Field>

          <Separator />

          <form.Field name="next">
            {(field) => (
              <TextFormField
                field={field}
                label="New password"
                type="password"
                autoComplete="new-password"
                placeholder="At least 8 characters"
                disabled={busy}
                required
                minLength={8}
              />
            )}
          </form.Field>

          <form.Field name="confirm">
            {(field) => (
              <TextFormField
                field={field}
                label="Confirm new password"
                type="password"
                autoComplete="new-password"
                disabled={busy}
                required
                minLength={8}
              />
            )}
          </form.Field>

          {submitError && (
            <Alert variant="destructive">
              <AlertDescription>{submitError}</AlertDescription>
            </Alert>
          )}

          <div className="flex justify-end">
            <form.Subscribe selector={(state) => [state.canSubmit, state.isSubmitting]}>
              {([canSubmit, isSubmitting]) => (
                <Button type="submit" disabled={!canSubmit || isSubmitting}>
                  {isSubmitting && (
                    <HugeiconsIcon icon={Loading03Icon} strokeWidth={2} className="animate-spin" />
                  )}
                  {isSubmitting ? "Updating…" : "Update password"}
                </Button>
              )}
            </form.Subscribe>
          </div>
        </div>
      </form>
    </ElevatedCard>
  );
}
