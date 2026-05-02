// Top navigation bar for non-explorer authenticated pages.
//
// Wordmark + optional center slot + optional left-of-menu actions slot
// + user menu. The user menu is the shared `<UserMenu>` so all
// authenticated chrome looks the same.

import { ReactNode } from "react";
import { Link } from "react-router-dom";

import type { User } from "@/lib/api/client";
import { UserMenu } from "@/components/UserMenu";

interface TopbarProps {
  user: User;
  /** Optional element rendered between the wordmark and the user menu. */
  center?: ReactNode;
  /** Optional element rendered immediately to the left of the user menu. */
  actions?: ReactNode;
}

export function Topbar({ user, center, actions }: TopbarProps) {
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-ink-soft/15 bg-paper/85 px-5 backdrop-blur supports-backdrop-filter:bg-paper/70">
      <Link
        to="/"
        className="font-heading text-xl text-ink transition-opacity hover:opacity-70"
        aria-label="Inkwell home"
      >
        inkwell
      </Link>

      {center && <div className="flex flex-1 justify-center">{center}</div>}
      {!center && <div className="flex-1" />}

      {actions && <div className="flex items-center gap-2">{actions}</div>}

      <UserMenu user={user} />
    </header>
  );
}
