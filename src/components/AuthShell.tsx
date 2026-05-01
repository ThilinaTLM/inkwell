// Centered shell used by Login + InviteAccept. Renders a soft radial-gradient
// backdrop behind a single Card so unauthenticated pages share visual rhythm.

import { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface AuthShellProps {
  title?: ReactNode;
  description?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function AuthShell({
  title,
  description,
  footer,
  children,
  className,
}: AuthShellProps) {
  return (
    <main className="relative grid min-h-dvh place-items-center overflow-hidden bg-background px-4 py-10">
      <BackdropGlow />
      <div className="relative z-10 w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-1.5 text-center">
          <div className="font-heading text-lg font-semibold tracking-tight">
            inkwell
          </div>
          <p className="text-[0.6875rem] text-muted-foreground">
            A small place for your Excalidraw scenes.
          </p>
        </div>
        <Card className={cn("gap-3", className)}>
          {(title || description) && (
            <CardHeader className="gap-1">
              {title && (
                <CardTitle className="font-heading text-sm font-medium">
                  {title}
                </CardTitle>
              )}
              {description && (
                <p className="text-xs/relaxed text-muted-foreground">
                  {description}
                </p>
              )}
            </CardHeader>
          )}
          <CardContent className="px-4">{children}</CardContent>
        </Card>
        {footer && (
          <div className="mt-4 text-center text-[0.6875rem] text-muted-foreground">
            {footer}
          </div>
        )}
      </div>
    </main>
  );
}

function BackdropGlow() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 -z-0 [background:radial-gradient(60%_50%_at_50%_0%,oklch(0.3_0_0/0.6)_0%,transparent_70%),radial-gradient(40%_30%_at_80%_100%,oklch(0.25_0_0/0.4)_0%,transparent_70%)]"
    />
  );
}
