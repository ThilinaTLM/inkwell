import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface ElevatedCardProps {
  children: ReactNode;
  className?: string;
}

/**
 * An elevated card surface that matches the login page (AuthShell)
 * aesthetic — paper-like shadow on light, deep shadow on dark.
 */
export function ElevatedCard({ children, className }: ElevatedCardProps) {
  return (
    <div
      className={cn(
        "relative rounded-lg bg-card ring-1 ring-border",
        "shadow-[0_8px_30px_-12px_rgba(28,24,20,0.18)] dark:shadow-[0_18px_40px_-14px_rgba(0,0,0,0.55)]",
        className,
      )}
    >
      {children}
    </div>
  );
}
