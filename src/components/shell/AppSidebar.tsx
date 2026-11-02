// Redesigned app sidebar (paper surface, ~248px).
//
//   wordmark · collapse
//   Search (opens the command palette, shows ⌘K)
//   Home · Inbox (count of loose root files) · Files
//   PROJECTS – top-level folders (ProjectIcon, name, item count); each row is a
//              drop target (data-drop-folder) so items can be dragged in
//   + New project
//   footer: uploads indicator · Settings · account menu
//
// Drop-target attributes follow features/explorer/dnd/itemDnd.ts:
//   Inbox  data-drop-folder="root"      project  data-drop-folder="<id>"

import {
  Add01Icon,
  Folder01Icon,
  Home01Icon,
  InboxIcon,
  Search01Icon,
  Settings02Icon,
  SidebarLeftIcon,
  Upload01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import { type ReactNode, useMemo } from "react";
import { Link, matchPath, useLocation } from "react-router-dom";
import { InkwellLogo } from "@/components/InkwellLogo";
import { ProjectIcon } from "@/components/project/ProjectIcon";
import type { ProjectFields } from "@/components/project/projectStyle";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useFiles } from "@/data/files";
import { useFolders } from "@/data/folders";
import { itemActions } from "@/features/actions/useItemActions";
import { toggleUploadTray, useUploadSummary } from "@/features/upload";
import type { User } from "@/lib/api/client";
import { formatKeys } from "@/lib/commands/keymap";
import { getEffectiveKeys, useRegistryVersion } from "@/lib/commands/registry";
import { cn } from "@/lib/utils";
import { CommandKeys } from "./Kbd";
import { SidebarUserMenu } from "./SidebarUserMenu";
import { openPalette, toggleSidebar } from "./shellStore";

const ROOT_FILES = { folderId: "root" } as const;

const DROP_CLASSES = cn(
  "data-[file-drop-over=true]:bg-accent-soft data-[file-drop-over=true]:outline-dashed data-[file-drop-over=true]:outline-[1.5px] data-[file-drop-over=true]:outline-primary",
  "data-[drop-over=true]:bg-accent-soft data-[drop-over=true]:outline-dashed data-[drop-over=true]:outline-[1.5px] data-[drop-over=true]:outline-primary",
  "data-[drop-invalid=true]:opacity-50",
);

export function AppSidebar({ user, onNavigate }: { user: User; onNavigate?: () => void }) {
  useRegistryVersion();
  const { pathname } = useLocation();
  const folders = useFolders();
  const inbox = useFiles(ROOT_FILES);
  const uploads = useUploadSummary();

  const projects = useMemo(
    () =>
      (folders.data ?? [])
        .filter((f) => f.parentId === null)
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" })),
    [folders.data],
  );
  const activeProjectId = useActiveProjectId(pathname, folders.data);

  return (
    <nav aria-label="Sidebar" className="flex h-full min-h-0 flex-col px-3 pt-3.5 pb-3">
      <div className="mb-3.5 flex items-center justify-between pl-1.5">
        <Link
          to="/"
          aria-label="Inkwell home"
          onClick={onNavigate}
          className="flex items-center rounded text-foreground outline-none transition-opacity hover:opacity-75 focus-visible:ring-2 focus-visible:ring-ring/40"
        >
          <InkwellLogo />
        </Link>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Collapse sidebar"
                onClick={toggleSidebar}
                className="hidden text-muted-foreground md:inline-flex"
              />
            }
          >
            <HugeiconsIcon icon={SidebarLeftIcon} strokeWidth={1.8} className="size-4" />
          </TooltipTrigger>
          <TooltipContent>
            Collapse sidebar ({formatKeys(getEffectiveKeys("view.sidebar"))})
          </TooltipContent>
        </Tooltip>
      </div>

      <button
        type="button"
        onClick={() => {
          onNavigate?.();
          openPalette();
        }}
        aria-label="Search files, folders and commands"
        className="mb-3 flex h-9 items-center gap-2 rounded-[10px] border border-border bg-card px-2.5 text-[13px] text-muted-foreground shadow-card transition-colors hover:border-input hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none"
      >
        <HugeiconsIcon icon={Search01Icon} strokeWidth={1.8} className="size-4 shrink-0" />
        <span className="flex-1 text-left">Search</span>
        <CommandKeys id="app.palette" className="max-md:hidden" />
      </button>

      <div className="flex flex-col gap-px">
        <NavItem
          to="/"
          icon={Home01Icon}
          label="Home"
          active={pathname === "/"}
          onNavigate={onNavigate}
        />
        <NavItem
          to="/inbox"
          icon={InboxIcon}
          label="Inbox"
          count={inbox.data?.length}
          active={pathname.startsWith("/inbox")}
          onNavigate={onNavigate}
          dropFolder="root"
        />
        <NavItem
          to="/files"
          icon={Folder01Icon}
          label="Files"
          active={pathname.startsWith("/files")}
          onNavigate={onNavigate}
        />
      </div>

      <div className="mt-5 mb-1 flex items-center justify-between pr-1 pl-2.5">
        <Link
          to="/projects"
          onClick={onNavigate}
          className="rounded text-[10.5px] font-semibold tracking-[0.09em] text-faint uppercase outline-none hover:text-foreground focus-visible:text-foreground"
        >
          Projects
        </Link>
      </div>
      <div className="-mr-2 min-h-0 flex-1 overflow-y-auto overflow-x-hidden pr-2">
        {folders.isPending ? (
          <div aria-hidden className="space-y-1.5 px-2 pt-1">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-6 animate-pulse rounded-md bg-sidebar-accent" />
            ))}
          </div>
        ) : (
          <ul className="flex flex-col gap-px">
            {projects.map((p) => (
              <li key={p.id}>
                <ProjectRow folder={p} active={activeProjectId === p.id} onNavigate={onNavigate} />
              </li>
            ))}
          </ul>
        )}
        <button
          type="button"
          onClick={() => {
            onNavigate?.();
            itemActions.newFolder(null);
          }}
          className="mt-0.5 flex h-8 w-full items-center gap-2 rounded-lg px-2.5 text-[13px] text-muted-foreground outline-none transition-colors hover:bg-sidebar-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40"
        >
          <HugeiconsIcon icon={Add01Icon} strokeWidth={1.8} className="size-4" />
          New project
        </button>
      </div>

      <div className="mt-2 flex flex-col gap-px border-t border-sidebar-border pt-2">
        {uploads.total > 0 ? (
          <button
            type="button"
            onClick={() => toggleUploadTray()}
            className="flex h-8 items-center gap-2.5 rounded-lg px-2.5 text-[13px] text-muted-foreground outline-none transition-colors hover:bg-sidebar-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40"
          >
            <HugeiconsIcon icon={Upload01Icon} strokeWidth={1.8} className="size-4" />
            <span>Uploads</span>
            {uploads.active > 0 || uploads.hasErrors ? (
              <span
                aria-hidden
                className={cn(
                  "ml-auto size-2 rounded-full",
                  uploads.hasErrors ? "bg-destructive" : "animate-pulse bg-primary",
                )}
              />
            ) : null}
          </button>
        ) : null}
        <NavItem
          to="/settings"
          icon={Settings02Icon}
          label="Settings"
          active={pathname.startsWith("/settings")}
          onNavigate={onNavigate}
        />
        <div className="mt-1 flex items-center">
          <SidebarUserMenu user={user} onNavigate={onNavigate} />
        </div>
      </div>
    </nav>
  );
}

/** The top-level project containing the current /folders/:id route. */
function useActiveProjectId(
  pathname: string,
  folders: Array<{ id: string; parentId: string | null }> | undefined,
): string | null {
  return useMemo(() => {
    const id = matchPath("/folders/:folderId", pathname)?.params.folderId;
    if (!id || !folders) return null;
    const byId = new Map(folders.map((f) => [f.id, f]));
    let cur = byId.get(id);
    for (let guard = 0; cur?.parentId && guard < 64; guard++) cur = byId.get(cur.parentId);
    return cur?.id ?? null;
  }, [pathname, folders]);
}

function NavItem({
  to,
  icon,
  label,
  count,
  active,
  onNavigate,
  dropFolder,
}: {
  to: string;
  icon: IconSvgElement;
  label: string;
  count?: number;
  active: boolean;
  onNavigate?: () => void;
  dropFolder?: string;
}) {
  return (
    <Link
      to={to}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      data-active={active}
      data-drop-folder={dropFolder}
      data-drop-name={dropFolder ? label : undefined}
      className={navRowClass}
    >
      <HugeiconsIcon icon={icon} strokeWidth={1.8} className="size-4 shrink-0" />
      <span className="truncate">{label}</span>
      {count ? <Count>{count}</Count> : null}
    </Link>
  );
}

const navRowClass = cn(
  "flex h-8 items-center gap-2.5 rounded-lg px-2.5 text-[13px] text-muted-foreground outline-none transition-colors hover:bg-sidebar-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40",
  "data-[active=true]:bg-sidebar-accent data-[active=true]:font-medium data-[active=true]:text-foreground",
  DROP_CLASSES,
);

function Count({ children }: { children: ReactNode }) {
  return <span className="ml-auto pl-2 text-[11px] text-faint tabular-nums">{children}</span>;
}

function ProjectRow({
  folder,
  active,
  onNavigate,
}: {
  folder: {
    id: string;
    name: string;
    fileCount: number;
    subfolderCount: number;
  } & ProjectFields;
  active: boolean;
  onNavigate?: () => void;
}) {
  const count = (folder.fileCount ?? 0) + (folder.subfolderCount ?? 0);
  return (
    <Link
      to={`/folders/${folder.id}`}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      data-active={active}
      data-drop-folder={folder.id}
      data-spring-folder={folder.id}
      title={folder.name}
      className={cn(navRowClass, "gap-2.5 px-2")}
    >
      <ProjectIcon folder={folder} size="sm" />
      <span className="truncate">{folder.name}</span>
      {count ? <Count>{count}</Count> : null}
    </Link>
  );
}
