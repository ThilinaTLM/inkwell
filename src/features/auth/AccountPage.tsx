import {
  Loading03Icon,
  Shield01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useForm } from "@tanstack/react-form";
import { useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { ElevatedCard } from "@/components/ElevatedCard";
import { PaperSurface } from "@/components/PaperSurface";
import { SectionHeading } from "@/components/SectionHeading";
import { ThemeToggle } from "@/components/ThemeToggle";
import { TextFormField } from "@/components/form/TextFormField";
import { Topbar } from "@/components/Topbar";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { useChangePassword, useMe } from "@/features/auth/hooks";
import { errorMessage } from "@/lib/errors";
import { userDisplayName } from "@/lib/user";

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

export default function AccountPage() {
  const me = useMe();
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
  const user = me.data;
  if (!user) return null;
  const fullName = userDisplayName(user);

  return (
    <PaperSurface variant="page" className="flex flex-col">
      <Topbar user={user} actions={<ThemeToggle />} />

      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-10">
        <header className="mb-8">
          <h1 className="font-heading text-3xl text-foreground">Account</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage your profile and security settings.
          </p>
        </header>

        <div className="flex flex-col gap-6">
          <ElevatedCard>
            <SectionHeading label="Profile" />
            <div className="px-6 pb-6">
              <p className="mb-4 text-sm text-muted-foreground">
                Read-only for now.
              </p>
              <dl className="grid grid-cols-[max-content_1fr] gap-x-8 gap-y-3 text-sm">
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
            </div>
          </ElevatedCard>

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
                  <form.Subscribe
                    selector={(state) => [state.canSubmit, state.isSubmitting]}
                  >
                    {([canSubmit, isSubmitting]) => (
                      <Button type="submit" disabled={!canSubmit || isSubmitting}>
                        {isSubmitting && (
                          <HugeiconsIcon
                            icon={Loading03Icon}
                            strokeWidth={2}
                            className="animate-spin"
                          />
                        )}
                        {isSubmitting ? "Updating…" : "Update password"}
                      </Button>
                    )}
                  </form.Subscribe>
                </div>
              </div>
            </form>
          </ElevatedCard>
        </div>
      </main>
    </PaperSurface>
  );
}
