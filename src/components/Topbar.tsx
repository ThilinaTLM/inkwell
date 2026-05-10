// Top navigation bar for authenticated pages.
//
// Slots, left-to-right:
//   wordmark  [leading]  …spacer…  [center]  …spacer…  [actions]  user menu
//
// `leading` sits right next to the wordmark (used by the dashboard for
// its view switcher). `center` is centered in the remaining space.
// `actions` sits immediately to the left of the shared `<UserMenu>`.
// Using the same `<Topbar>` everywhere keeps height, wordmark, and
// border consistent across Dashboard, Admin, Account, etc.

import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { InkwellMark } from "@/components/InkwellMark";
import { UserMenu } from "@/components/UserMenu";
import type { User } from "@/lib/api/client";

interface TopbarProps {
  user: User;
  /** Optional element rendered immediately to the right of the wordmark. */
  leading?: ReactNode;
  /** Optional element centered between wordmark and user menu. */
  center?: ReactNode;
  /** Optional element rendered immediately to the left of the user menu. */
  actions?: ReactNode;
}

export function Topbar({ user, leading, center, actions }: TopbarProps) {
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-background/85 px-5 backdrop-blur supports-backdrop-filter:bg-background/70">
      <Link
        to="/"
        className="flex items-center gap-2 font-brand text-xl text-foreground transition-opacity hover:opacity-70"
        aria-label="Inkwell home"
      >
        <InkwellMark className="size-5" />
        <span>inkwell</span>
      </Link>

      {leading && <div className="flex items-center gap-2">{leading}</div>}

      {center ? (
        <div className="flex flex-1 justify-center">{center}</div>
      ) : (
        <div className="flex-1" />
      )}

      {actions && <div className="flex items-center gap-2">{actions}</div>}

      <UserMenu user={user} />
    </header>
  );
}
