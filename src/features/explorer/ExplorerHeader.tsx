// ExplorerHeader — paper-banner header for the dashboard.
//
// Layout:
//   [ inkwell ]   [ Browse | Recent | Search ]            [ Users? ] [ avatar ]
//
// Search and creation aren't part of the header — search is its own
// view, scene/folder creation happens inline in Browse via `<AddTile>`
// or the right-click context menu.
//
// The admin "Users" icon button is a one-click jump to /admin and only
// renders when `user.isAdmin` is true.

import { Link, useNavigate } from "react-router-dom";
import { HugeiconsIcon } from "@hugeicons/react";
import { UserMultipleIcon } from "@hugeicons/core-free-icons";

import type { User } from "@/lib/api/client";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { UserMenu } from "@/components/UserMenu";
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

  return (
    <header className="relative px-6 pt-6 pb-3">
      <div className="flex items-center gap-4">
        <Link
          to="/"
          aria-label="Inkwell home"
          className="font-heading text-2xl text-ink transition-opacity hover:opacity-70"
        >
          inkwell
        </Link>

        <ViewSwitcher active={view} onChange={onChangeView} />

        <div className="ml-auto flex items-center gap-2">
          {user.isAdmin && (
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
          )}

          <UserMenu user={user} />
        </div>
      </div>
    </header>
  );
}
