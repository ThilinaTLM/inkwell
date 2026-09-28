// App sidebar (wireframe `sidebar()`): New ▾ split button + Upload,
// Library nav with counts, Folders tree, Tags, Settings / Users.
//
// Drop-target attributes (DnD is wired by the explorer/upload modules):
//   Home      data-drop-folder="root"
//   Trash     data-drop-trash=""
//   tree rows data-drop-folder="<id>" data-spring-folder="<id>"

import {
  ArrowDown01Icon,
  Clock01Icon,
  Delete02Icon,
  Home01Icon,
  Link04Icon,
  PlusSignIcon,
  Settings02Icon,
  StarIcon,
  Upload01Icon,
  UserMultipleIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import { useQuery } from "@tanstack/react-query";
import { type ReactNode, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useFolders } from "@/data/folders";
import { useAllShares } from "@/data/shares";
import { useTags } from "@/data/tags";
import { NEW_MENU_IDS } from "@/features/actions/itemCommands";
import { itemActions } from "@/features/actions/useItemActions";
import { openUploadPicker } from "@/features/upload";
import { files, trash } from "@/lib/api/client";
import { keys } from "@/lib/api/query-keys";
import { CommandMenuItems } from "@/lib/commands/CommandMenuItems";
import { formatKeys } from "@/lib/commands/keymap";
import { getEffectiveKeys, useCommandContext } from "@/lib/commands/registry";
import { cn } from "@/lib/utils";
import { SidebarFolderTree } from "./SidebarFolderTree";
import { tagColor } from "./tagColor";

const STARRED_QUERY = { starred: true } as const;

export function Sidebar({ isAdmin, onNavigate }: { isAdmin: boolean; onNavigate?: () => void }) {
  const ctx = useCommandContext();
  const location = useLocation();
  const folderId = ctx.currentFolderId ?? null;
  const folders = useFolders();
  const tags = useTags();
  const shares = useAllShares();
  const starredFiles = useQuery({
    queryKey: keys.files.list(STARRED_QUERY),
    queryFn: () => files.list(STARRED_QUERY),
    retry: false,
  });
  const trashList = useQuery({
    queryKey: keys.trash.list(),
    queryFn: () => trash.list(),
    retry: false,
  });
  const [showAllTags, setShowAllTags] = useState(false);

  const starredCount =
    (starredFiles.data?.filter((f) => f.starredAt).length ?? 0) +
    (folders.data?.filter((f) => f.starredAt).length ?? 0);
  const activeShares = useMemo(() => {
    const now = Date.now();
    return (shares.data ?? []).filter((s) => s.expiresAt === null || s.expiresAt > now).length;
  }, [shares.data]);
  const trashCount = trashList.data?.length ?? 0;

  const tagList = useMemo(
    () =>
      (tags.data ?? [])
        .filter((t) => t.fileCount + t.folderCount > 0)
        .sort((a, b) => a.name.localeCompare(b.name)),
    [tags.data],
  );
  const visibleTags = showAllTags ? tagList : tagList.slice(0, 8);
  const path = location.pathname;

  return (
    <nav aria-label="Sidebar" className="flex h-full min-h-0 flex-col px-2 pt-2.5 pb-2">
      <div className="mx-1 mb-2.5 flex gap-1.5">
        <div className="flex flex-1">
          <Button
            className="h-[30px] flex-1 rounded-r-none"
            onClick={() => void itemActions.newFile(folderId)}
            title={`New file (${formatKeys(getEffectiveKeys("file.newFile"))})`}
          >
            <HugeiconsIcon icon={PlusSignIcon} strokeWidth={2.2} />
            New
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  className="h-[30px] rounded-l-none border-l border-primary-foreground/25 px-1.5"
                  aria-label="New…"
                />
              }
            >
              <HugeiconsIcon icon={ArrowDown01Icon} strokeWidth={2.2} />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-60">
              <DropdownMenuLabel>Create</DropdownMenuLabel>
              <CommandMenuItems ids={NEW_MENU_IDS} as="dropdown" />
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="outline"
                className="h-[30px] px-2"
                aria-label="Upload files"
                onClick={() => openUploadPicker({ folderId })}
              />
            }
          >
            <HugeiconsIcon icon={Upload01Icon} strokeWidth={2} />
          </TooltipTrigger>
          <TooltipContent>Upload ({formatKeys(getEffectiveKeys("file.upload"))})</TooltipContent>
        </Tooltip>
      </div>

      <div className="-mr-2 min-h-0 flex-1 overflow-y-auto overflow-x-hidden pr-2.5 pl-0.5">
        <SectionHeader>Library</SectionHeader>
        <NavItem
          to="/"
          icon={Home01Icon}
          label="Home"
          active={path === "/"}
          onNavigate={onNavigate}
          attrs={{ "data-drop-folder": "root" }}
        />
        <NavItem
          to="/recent"
          icon={Clock01Icon}
          label="Recent"
          active={path === "/recent"}
          onNavigate={onNavigate}
        />
        <NavItem
          to="/starred"
          icon={StarIcon}
          label="Starred"
          count={starredCount}
          active={path === "/starred"}
          onNavigate={onNavigate}
        />
        <NavItem
          to="/shares"
          icon={Link04Icon}
          label="Shared links"
          count={activeShares}
          active={path.startsWith("/shares")}
          onNavigate={onNavigate}
        />
        <NavItem
          to="/trash"
          icon={Delete02Icon}
          label="Trash"
          count={trashCount}
          active={path.startsWith("/trash")}
          onNavigate={onNavigate}
          attrs={{ "data-drop-trash": "" }}
        />

        <SectionHeader
          action={
            <button
              type="button"
              aria-label="New folder"
              title="New folder"
              onClick={() => itemActions.newFolder(null)}
              className="grid size-4 place-items-center rounded hover:bg-muted hover:text-foreground"
            >
              <HugeiconsIcon icon={PlusSignIcon} strokeWidth={2} className="size-3" />
            </button>
          }
        >
          Folders
        </SectionHeader>
        {folders.data ? (
          <SidebarFolderTree
            folders={folders.data}
            currentFolderId={ctx.currentFolderId}
            onNavigate={onNavigate}
          />
        ) : null}

        {tagList.length ? (
          <>
            <SectionHeader>Tags</SectionHeader>
            {visibleTags.map((t) => {
              const to = `/tags/${encodeURIComponent(t.name)}`;
              return (
                <NavItem
                  key={t.id}
                  to={to}
                  label={t.name}
                  count={t.fileCount + t.folderCount}
                  active={decodeURIComponent(path) === `/tags/${t.name}`}
                  onNavigate={onNavigate}
                  leading={
                    <span
                      aria-hidden
                      className="mx-[3px] size-2 shrink-0 rounded-full"
                      style={{ background: tagColor(t.name) }}
                    />
                  }
                />
              );
            })}
            {tagList.length > 8 ? (
              <button
                type="button"
                onClick={() => setShowAllTags((v) => !v)}
                className="ml-2.5 py-1 text-[11.5px] text-muted-foreground hover:text-foreground"
              >
                {showAllTags ? "Show fewer" : `Show all ${tagList.length}`}
              </button>
            ) : null}
          </>
        ) : null}
      </div>

      <div className="mt-2 border-t border-border pt-2">
        <NavItem
          to="/settings"
          icon={Settings02Icon}
          label="Settings"
          active={path.startsWith("/settings")}
          onNavigate={onNavigate}
        />
        {isAdmin ? (
          <NavItem
            to="/users"
            icon={UserMultipleIcon}
            label="Users"
            active={path.startsWith("/users")}
            onNavigate={onNavigate}
            badge="admin"
          />
        ) : null}
      </div>
    </nav>
  );
}

function SectionHeader({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mx-2.5 mt-3 mb-1 flex items-center justify-between text-[10.5px] tracking-[0.09em] text-muted-foreground/80 uppercase">
      <span>{children}</span>
      {action}
    </div>
  );
}

function NavItem({
  to,
  icon,
  leading,
  label,
  count,
  badge,
  active,
  onNavigate,
  attrs,
}: {
  to: string;
  icon?: IconSvgElement;
  leading?: ReactNode;
  label: string;
  count?: number;
  badge?: string;
  active: boolean;
  onNavigate?: () => void;
  attrs?: Record<string, string>;
}) {
  return (
    <Link
      to={to}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      data-active={active}
      {...attrs}
      className={cn(
        "relative mb-px flex h-7 items-center gap-2 rounded-md px-2.5 text-[13px] text-muted-foreground transition-colors outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40",
        "data-[active=true]:bg-muted data-[active=true]:font-medium data-[active=true]:text-foreground",
        "data-[file-drop-over=true]:bg-accent data-[file-drop-over=true]:text-accent-foreground data-[file-drop-over=true]:outline-dashed data-[file-drop-over=true]:outline-[1.5px] data-[file-drop-over=true]:outline-primary",
        "data-[drop-over=true]:bg-accent data-[drop-over=true]:text-accent-foreground data-[drop-over=true]:outline-dashed data-[drop-over=true]:outline-[1.5px] data-[drop-over=true]:outline-primary",
      )}
    >
      {active ? (
        <span
          aria-hidden
          className="absolute top-1.5 bottom-1.5 -left-2 w-[3px] rounded-full bg-primary"
        />
      ) : null}
      {icon ? (
        <HugeiconsIcon icon={icon} strokeWidth={1.8} className="size-[15px] shrink-0" />
      ) : null}
      {leading}
      <span className="truncate">{label}</span>
      {badge ? (
        <span className="ml-auto text-[10.5px] text-muted-foreground/70">{badge}</span>
      ) : count ? (
        <span className="ml-auto text-[11px] text-muted-foreground/70">{count}</span>
      ) : null}
    </Link>
  );
}
