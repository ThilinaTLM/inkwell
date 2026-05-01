// Top navigation bar for authenticated pages. Renders the wordmark + an
// optional center slot (e.g. dashboard search) and a right-aligned user menu.

import { ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Logout03Icon,
  Settings02Icon,
  Shield01Icon,
  UserCircleIcon,
} from "@hugeicons/core-free-icons";
import { toast } from "sonner";

import { User, auth } from "@/api";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface TopbarProps {
  user: User;
  /** Optional element rendered between the wordmark and the user menu. */
  center?: ReactNode;
  /** Optional element rendered immediately to the left of the user menu. */
  actions?: ReactNode;
  /** Notified when the user signs out so the parent can clear local state. */
  onLogout?: () => void;
}

export function Topbar({ user, center, actions, onLogout }: TopbarProps) {
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
      // best-effort; we still clear local state
    }
    onLogout?.();
    navigate("/login", { replace: true });
  }

  return (
    <header className="sticky top-0 z-30 flex h-12 items-center gap-3 border-b border-border/60 bg-background/80 px-4 backdrop-blur supports-backdrop-filter:bg-background/60">
      <Link
        to="/"
        className="font-heading text-sm font-semibold tracking-tight text-foreground transition-opacity hover:opacity-80"
        aria-label="Inkwell home"
      >
        inkwell
      </Link>

      {center && <div className="flex flex-1 justify-center">{center}</div>}
      {!center && <div className="flex-1" />}

      {actions && <div className="flex items-center gap-2">{actions}</div>}

      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1.5 pl-1 pr-1.5"
              aria-label={`Account menu for ${fullName}`}
            />
          }
        >
          <Avatar size="sm" className="size-5">
            <AvatarFallback className="text-[0.625rem] font-medium uppercase">
              {initials.slice(0, 2)}
            </AvatarFallback>
          </Avatar>
          <span className="max-w-[10rem] truncate text-xs/relaxed">
            {fullName}
          </span>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" sideOffset={6} className="min-w-56">
          <DropdownMenuLabel>
            <div className="flex flex-col gap-0.5">
              <span className="truncate text-xs font-medium text-foreground">
                {fullName}
              </span>
              <span className="truncate text-[0.6875rem] text-muted-foreground">
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
    </header>
  );
}
