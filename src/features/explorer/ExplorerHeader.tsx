// ExplorerHeader — dashboard header.
//
// Layout:
//   [ inkwell ]                                                   [ avatar ]
//
// Composes the shared `<Topbar>` so the dashboard chrome matches the
// rest of the authenticated app (Account, Users, Shares) — same
// height, same wordmark, identical right-side. The Topbar's right
// side intentionally renders only `<UserMenu>` on every authenticated
// page; cross-page navigation (Dashboard / Settings / Shared Links /
// Users) lives in the user-menu dropdown rather than as duplicated
// icon shortcuts in the strip itself.
//
// Search and creation aren't part of the header — file/folder
// creation lives in the in-panel header buttons (and the right-click
// context menu in any view).

import { Topbar } from "@/components/Topbar";
import type { User } from "@/lib/api/client";

interface ExplorerHeaderProps {
  user: User;
}

export function ExplorerHeader({ user }: ExplorerHeaderProps) {
  return <Topbar user={user} />;
}
