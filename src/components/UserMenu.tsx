// User menu — avatar + dropdown shared by Topbar and ExplorerHeader.
//
// Note: this used to be duplicated across both headers with subtly
// different trigger styling. Unified here on the shadcn `<Button
// variant="ghost">` look so the two surfaces match.

import { useNavigate } from "react-router-dom";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Logout03Icon,
  Settings02Icon,
  Shield01Icon,
  UserCircleIcon,
} from "@hugeicons/core-free-icons";
import { toast } from "sonner";

import type { User } from "@/lib/api/client";
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
import { useLogout } from "@/features/auth/hooks";
import { userDisplayName, userInitials } from "@/lib/user";

interface UserMenuProps {
  user: User;
  /** Notified after a successful logout, before the redirect to /login. */
  onLogout?: () => void;
}

export function UserMenu({ user, onLogout }: UserMenuProps) {
  const navigate = useNavigate();
  const logout = useLogout();

  const fullName = userDisplayName(user);
  const initials = userInitials(user).slice(0, 2);

  async function handleLogout() {
    try {
      await logout.mutateAsync();
    } catch {
      // Best-effort — local cache is cleared in either case.
    }
    onLogout?.();
    toast.success("Signed out.");
    navigate("/login", { replace: true });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="sm"
            className="h-9 gap-2 pl-1 pr-2"
            aria-label={`Account menu for ${fullName}`}
          />
        }
      >
        <Avatar size="sm" className="size-7 ring-1 ring-ink-soft/30">
          <AvatarFallback className="bg-manila text-ink text-[0.7rem] font-heading uppercase">
            {initials}
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
            void handleLogout();
          }}
        >
          <HugeiconsIcon icon={Logout03Icon} strokeWidth={2} />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
