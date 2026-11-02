// Sidebar footer account control: avatar + name, menu with theme toggle
// and sign out.

import { Logout03Icon, Moon02Icon, Settings02Icon, Sun03Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useLogout } from "@/data/auth";
import type { User } from "@/lib/api/client";
import { useTheme } from "@/lib/theme";
import { userDisplayName, userInitials } from "@/lib/user";

export function SidebarUserMenu({ user, onNavigate }: { user: User; onNavigate?: () => void }) {
  const navigate = useNavigate();
  const logout = useLogout();
  const { resolved, toggle } = useTheme();
  const name = userDisplayName(user);

  async function signOut() {
    try {
      await logout.mutateAsync();
    } catch {
      // Best-effort — the local cache is cleared either way.
    }
    toast.success("Signed out.");
    navigate("/login", { replace: true });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`Account menu for ${name}`}
        className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-lg px-1.5 text-left outline-none transition-colors hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-ring/40 aria-expanded:bg-sidebar-accent"
      >
        <Avatar size="sm" className="size-7 ring-1 ring-border">
          <AvatarFallback className="bg-accent-soft text-[0.7rem] font-medium text-accent-text uppercase">
            {userInitials(user).slice(0, 2)}
          </AvatarFallback>
        </Avatar>
        <span className="min-w-0 truncate text-[13px] font-medium text-foreground">{name}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side="top" sideOffset={6} className="min-w-56">
        <DropdownMenuLabel>
          <div className="flex flex-col gap-0.5">
            <span className="truncate text-sm font-medium text-foreground">{name}</span>
            <span className="truncate text-[0.6875rem] text-muted-foreground">{user.email}</span>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => {
            onNavigate?.();
            navigate("/settings");
          }}
        >
          <HugeiconsIcon icon={Settings02Icon} strokeWidth={2} />
          Settings
        </DropdownMenuItem>
        <DropdownMenuItem onClick={toggle}>
          <HugeiconsIcon icon={resolved === "dark" ? Sun03Icon : Moon02Icon} strokeWidth={2} />
          {resolved === "dark" ? "Switch to light theme" : "Switch to dark theme"}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onClick={() => void signOut()}>
          <HugeiconsIcon icon={Logout03Icon} strokeWidth={2} />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
