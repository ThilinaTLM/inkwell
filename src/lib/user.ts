// Display helpers for User / AdminUser objects.
//
// Replaces inline copies of the same logic in Topbar.tsx and
// ExplorerHeader.tsx (and Admin.tsx).

import type { User } from "@/lib/api/client";

/**
 * Best display name for a user: full name when available, otherwise
 * email. Never returns an empty string.
 */
export function userDisplayName(u: Pick<User, "firstName" | "lastName" | "email">): string {
  const full = [u.firstName, u.lastName].filter(Boolean).join(" ");
  return full || u.email;
}

/**
 * 1-2 character avatar initials. Falls back to the first email character
 * (uppercased) when no name is set.
 */
export function userInitials(u: Pick<User, "firstName" | "lastName" | "email">): string {
  const fi = u.firstName?.[0];
  const li = u.lastName?.[0];
  const both = (fi ?? "") + (li ?? "");
  if (both) return both.toUpperCase();
  return (u.email[0] ?? "?").toUpperCase();
}
