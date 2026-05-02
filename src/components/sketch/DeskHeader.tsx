// DeskHeader — the paper-banner top bar of the Dashboard. Replaces the
// generic Topbar for authenticated dashboard pages. Carries:
//   • Inkwell wordmark (Excalifont)
//   • Search input (paper-card with rough underline)
//   • "+ New scene" CTA (vermillion)
//   • User menu dropdown (Account / Scenes / Admin / Sign out)
//
// The banner sits on top of the paper page; we draw a single rough
// horizontal underline below the bar so it reads like a sketched divider
// rather than a CSS border.

import { ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Logout03Icon,
  PlusSignIcon,
  Search01Icon,
  Settings02Icon,
  Shield01Icon,
  UserCircleIcon,
} from "@hugeicons/core-free-icons";
import { toast } from "sonner";

import { auth, type User } from "@/api";
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

interface DeskHeaderProps {
  user: User;
  search: string;
  onSearchChange: (value: string) => void;
  onCreateScene: () => void;
  creating?: boolean;
  onLogout?: () => void;
  /** Optional extra slot rendered between search and CTA. */
  extras?: ReactNode;
}

export function DeskHeader({
  user,
  search,
  onSearchChange,
  onCreateScene,
  creating,
  onLogout,
  extras,
}: DeskHeaderProps) {
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
      // best-effort
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

        <div className="relative ml-2 hidden flex-1 sm:block">
          <div className="relative max-w-md">
            <HugeiconsIcon
              icon={Search01Icon}
              strokeWidth={1.8}
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-soft"
            />
            <input
              type="search"
              placeholder="Search scenes…"
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              className="w-full rounded-md bg-paper-elev/60 py-2 pl-9 pr-3 font-sans text-sm text-ink placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-vermillion/30 border-b border-ink-soft/40 focus:border-vermillion/60 transition-colors"
            />
          </div>
        </div>

        {extras}

        <Button
          onClick={onCreateScene}
          disabled={creating}
          className="font-heading text-sm"
        >
          <HugeiconsIcon icon={PlusSignIcon} strokeWidth={2} />
          New scene
        </Button>

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

      {/* Mobile-only search row */}
      <div className="relative mt-3 sm:hidden">
        <HugeiconsIcon
          icon={Search01Icon}
          strokeWidth={1.8}
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-soft"
        />
        <input
          type="search"
          placeholder="Search scenes…"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          className="w-full rounded-md bg-paper-elev/60 py-2 pl-9 pr-3 font-sans text-sm text-ink placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-vermillion/30 border-b border-ink-soft/40 focus:border-vermillion/60 transition-colors"
        />
      </div>
    </header>
  );
}
