// ExplorerHeader — dashboard header.
//
// Layout:
//   [ inkwell ] [ Browse | Recent | Search ]              [ Users? ] [ avatar ]
//
// Composes the shared `<Topbar>` so the dashboard chrome matches the
// rest of the authenticated app (Account, Admin) — same height, same
// wordmark, same bottom border. The view switcher slots into `center`
// and the admin shortcut into `actions`.
//
// Search and creation aren't part of the header — search is its own
// view, and scene/folder creation lives in the page-header buttons of
// Browse / Recent (and the right-click context menu in any view).
//
// The admin "Users" icon button is a one-click jump to /admin and only
// renders when `user.isAdmin` is true.

import { useNavigate } from "react-router-dom";
import { HugeiconsIcon } from "@hugeicons/react";
import { UserMultipleIcon } from "@hugeicons/core-free-icons";

import type { User } from "@/lib/api/client";
import { Topbar } from "@/components/Topbar";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import { ViewSwitcher, type ExplorerView } from "./ViewSwitcher";

interface ExplorerHeaderProps {
  user: User;
  view: ExplorerView;
  onChangeView: (next: ExplorerView) => void;
}

export function ExplorerHeader({
  user,
  view,
  onChangeView,
}: ExplorerHeaderProps) {
  const navigate = useNavigate();

  const leading = <ViewSwitcher active={view} onChange={onChangeView} />;

  const actions = user.isAdmin ? (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            onClick={() => navigate("/admin")}
            aria-label="Manage users"
            className={cn(
              "grid size-8 place-items-center rounded-md text-ink-soft transition-colors hover:bg-manila-soft/50 hover:text-ink",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
            )}
          />
        }
      >
        <HugeiconsIcon
          icon={UserMultipleIcon}
          strokeWidth={1.7}
          className="size-4"
        />
      </TooltipTrigger>
      <TooltipContent>Users</TooltipContent>
    </Tooltip>
  ) : null;

  return <Topbar user={user} leading={leading} actions={actions} />;
}

