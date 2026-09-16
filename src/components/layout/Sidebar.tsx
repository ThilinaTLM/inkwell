// Sidebar — the persistent workspace navigation.
//
// Three stacked sections plus a footer:
//   Workspace  Home · All files · Shared links
//   Folders    "All folders" + the folder tree (scrollable)
//   Tags       the user's tags, most-used first
//   Footer     Settings · Users (admin) · theme toggle
//
// Two widths: full (240px) and an icon rail (56px) that keeps only the
// primary nav and the footer. The collapsed state is owned by
// `<AppShell>` and persisted in localStorage, so it survives reloads and
// stays put while navigating.

import {
  ComputerIcon,
  DashboardSquare02Icon,
  File01Icon,
  FolderLibraryIcon,
  Link04Icon,
  Moon02Icon,
  Settings02Icon,
  Sun03Icon,
  Tag01Icon,
  UserMultipleIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { ReactNode } from "react";
import { NavLink, useLocation, useNavigate, useParams } from "react-router-dom";

import { InkwellMark } from "@/components/InkwellMark";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useFolders } from "@/data/folders";
import { useTags } from "@/data/tags";
import { FolderTree } from "@/features/folders/FolderTree";
import type { User } from "@/lib/api/client";
import { useTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";

interface SidebarProps {
  user: User;
  collapsed: boolean;
  /** Called when a nav item is activated — lets the mobile overlay close itself. */
  onNavigate?: () => void;
}

export function Sidebar({ user, collapsed, onNavigate }: SidebarProps) {
  const folders = useFolders();
  const tags = useTags();
  const navigate = useNavigate();
  const location = useLocation();
  const params = useParams<{ folderId: string; tag: string }>();
  const theme = useTheme();

  const activeFolderId = params.folderId ?? null;
  const inFolders = location.pathname.startsWith("/folders");

  return (
    <div className="flex h-full flex-col gap-1 overflow-hidden bg-sidebar text-sidebar-foreground">
      {/* Brand */}
      <div
        className={cn(
          "flex h-14 shrink-0 items-center gap-2 px-3",
          collapsed && "justify-center px-0",
        )}
      >
        <NavLink
          to="/"
          onClick={onNavigate}
          className="flex items-center gap-2 rounded-md px-1 py-1 text-sidebar-foreground outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
          aria-label="Inkwell home"
        >
          <InkwellMark className="size-5 shrink-0" />
          {!collapsed && <span className="text-sm font-semibold tracking-tight">Inkwell</span>}
        </NavLink>
      </div>

      <nav className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-2 pb-2">
        {/* Workspace */}
        <ul className="flex flex-col gap-0.5">
          <NavItem
            to="/"
            end
            icon={DashboardSquare02Icon}
            label="Home"
            collapsed={collapsed}
            onNavigate={onNavigate}
          />
          <NavItem
            to="/files"
            icon={File01Icon}
            label="All files"
            collapsed={collapsed}
            onNavigate={onNavigate}
          />
          <NavItem
            to="/folders"
            icon={FolderLibraryIcon}
            label="Folders"
            active={inFolders}
            collapsed={collapsed}
            onNavigate={onNavigate}
          />
          <NavItem
            to="/shares"
            icon={Link04Icon}
            label="Shared links"
            collapsed={collapsed}
            onNavigate={onNavigate}
          />
        </ul>

        {!collapsed && (
          <>
            {/* Folder tree */}
            <section className="flex min-h-0 flex-col gap-1">
              <SidebarLabel>Folders</SidebarLabel>
              {folders.data && folders.data.length > 0 ? (
                <FolderTree
                  folders={folders.data}
                  selectedId={activeFolderId}
                  onSelect={(id) => {
                    navigate(id ? `/folders/${id}` : "/folders");
                    onNavigate?.();
                  }}
                  className="px-1"
                />
              ) : (
                <p className="px-2 py-1 text-xs text-muted-foreground">No folders yet.</p>
              )}
            </section>

            {/* Tags */}
            {tags.data && tags.data.length > 0 ? (
              <section className="flex flex-col gap-1">
                <SidebarLabel>Tags</SidebarLabel>
                <ul className="flex flex-col gap-0.5 px-1">
                  {tags.data.slice(0, 12).map((t) => (
                    <li key={t.id}>
                      <NavLink
                        to={`/tags/${encodeURIComponent(t.name)}`}
                        onClick={onNavigate}
                        className={({ isActive }) =>
                          cn(
                            "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                            isActive &&
                              "bg-sidebar-accent font-medium text-sidebar-accent-foreground",
                            params.tag === t.name &&
                              "bg-sidebar-accent font-medium text-sidebar-accent-foreground",
                          )
                        }
                      >
                        <HugeiconsIcon
                          icon={Tag01Icon}
                          strokeWidth={1.7}
                          className="size-4 shrink-0 opacity-70"
                        />
                        <span className="truncate">{t.name}</span>
                      </NavLink>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </>
        )}
      </nav>

      {/* Footer */}
      <div
        className={cn(
          "flex shrink-0 flex-col gap-0.5 border-t border-sidebar-border p-2",
          collapsed && "items-center",
        )}
      >
        <ul className="flex w-full flex-col gap-0.5">
          <NavItem
            to="/settings"
            icon={Settings02Icon}
            label="Settings"
            collapsed={collapsed}
            onNavigate={onNavigate}
          />
          {user.isAdmin ? (
            <NavItem
              to="/users"
              icon={UserMultipleIcon}
              label="Users"
              collapsed={collapsed}
              onNavigate={onNavigate}
            />
          ) : null}
        </ul>
        <Button
          variant="ghost"
          size={collapsed ? "icon-sm" : "sm"}
          onClick={theme.cycle}
          aria-label={`Theme: ${theme.mode}. Click to change.`}
          className={cn("text-muted-foreground", !collapsed && "justify-start")}
        >
          <HugeiconsIcon
            icon={
              theme.mode === "system"
                ? ComputerIcon
                : theme.resolved === "dark"
                  ? Moon02Icon
                  : Sun03Icon
            }
            strokeWidth={1.7}
          />
          {!collapsed && (
            <span className="capitalize">
              {theme.mode === "system" ? "System theme" : `${theme.mode} theme`}
            </span>
          )}
        </Button>
      </div>
    </div>
  );
}

function SidebarLabel({ children }: { children: ReactNode }) {
  return (
    <div className="px-2 text-[0.6875rem] font-medium uppercase tracking-wide text-muted-foreground/70">
      {children}
    </div>
  );
}

function NavItem({
  to,
  end,
  icon,
  label,
  collapsed,
  active,
  onNavigate,
}: {
  to: string;
  end?: boolean;
  // biome-ignore lint/suspicious/noExplicitAny: icon shape comes from @hugeicons/core-free-icons
  icon: any;
  label: string;
  collapsed: boolean;
  active?: boolean;
  onNavigate?: () => void;
}) {
  const link = (
    <NavLink
      to={to}
      end={end}
      onClick={onNavigate}
      className={({ isActive }) =>
        cn(
          "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
          collapsed && "justify-center px-0",
          (active ?? isActive) && "bg-sidebar-accent text-sidebar-accent-foreground",
        )
      }
    >
      <HugeiconsIcon icon={icon} strokeWidth={1.7} className="size-4 shrink-0" />
      {!collapsed && <span className="truncate">{label}</span>}
    </NavLink>
  );

  return (
    <li>
      {collapsed ? (
        <Tooltip>
          <TooltipTrigger render={link} />
          <TooltipContent side="right">{label}</TooltipContent>
        </Tooltip>
      ) : (
        link
      )}
    </li>
  );
}
