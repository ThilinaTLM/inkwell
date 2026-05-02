// ExplorerHeader — paper-banner header for the dashboard.
//
// Layout:
//   [ inkwell ]                  [ Browse | Recent | Search ]   [ Users? ] [ avatar ]
//
// The persistent search input and "+ New scene" CTA from the previous
// `DeskHeader` are removed. Search is its own view; creation happens
// inline (via `AddTile` in Browse and via the right-click context menu).
//
// The admin "Users" icon button appears next to the avatar when
// `user.isAdmin` is true and routes to `/admin`. It's exposed in the
// header (in addition to the avatar dropdown) so admins can jump there
// in one click.

import { Link, useNavigate } from "react-router-dom";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Logout03Icon,
  Settings02Icon,
  Shield01Icon,
  UserCircleIcon,
  UserMultipleIcon,
} from "@hugeicons/core-free-icons";
import { toast } from "sonner";

import { auth, type User } from "@/api";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import { ViewSwitcher, type ExplorerView } from "./ViewSwitcher";

interface ExplorerHeaderProps {
  user: User;
  view: ExplorerView;
  onChangeView: (next: ExplorerView) => void;
  onLogout?: () => void;
}

export function ExplorerHeader({
  user,
  view,
  onChangeView,
  onLogout,
}: ExplorerHeaderProps) {
  const navigate = useNavigate();
  const fullName =
    [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email;
  const initials =
    (user.firstName?.[0] ?? "") + (user.lastName?.[0] ?? "") ||
    user.email[0]?.toUpperCase() ||
    "?";

  async function logout() {
    try {
      await auth.logout();
    } catch {
      /* best-effort */
    }
    onLogout?.();
    navigate("/login", { replace: true });
  }

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
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
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

          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <button
                  type="button"
                  className="inline-flex items-center gap-2 rounded-md px-1.5 py-1 transition-colors hover:bg-manila-soft/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                  aria-label={`Account menu for ${fullName}`}
                />
              }
            >
              <Avatar size="sm" className="size-7 ring-1 ring-ink-soft/30">
                <AvatarFallback className="bg-manila text-ink text-[0.7rem] font-heading uppercase">
                  {initials.slice(0, 2)}
                </AvatarFallback>
              </Avatar>
              <span className="hidden max-w-[10rem] truncate font-sans text-xs text-ink md:inline">
                {fullName}
              </span>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" sideOffset={6} className="min-w-56">
              <DropdownMenuLabel>
                <div className="flex flex-col gap-0.5">
                  <span className="truncate font-heading text-sm text-ink">
                    {fullName}
                  </span>
                  <span className="truncate font-sans text-[0.6875rem] text-ink-muted">
                    {user.email}
                  </span>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => navigate("/account")}>
                <HugeiconsIcon icon={UserCircleIcon} strokeWidth={2} />
                Account
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate("/")}>
                <HugeiconsIcon icon={Settings02Icon} strokeWidth={2} />
                Scenes
              </DropdownMenuItem>
              {user.isAdmin && (
                <DropdownMenuItem onClick={() => navigate("/admin")}>
                  <HugeiconsIcon icon={Shield01Icon} strokeWidth={2} />
                  Admin
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                onClick={() => {
                  void logout().then(() => toast.success("Signed out."));
                }}
              >
                <HugeiconsIcon icon={Logout03Icon} strokeWidth={2} />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
