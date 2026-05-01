// Dashboard sidebar: "All scenes" pseudo-row, folder tree, and tag filter
// list. Stateful enough to render dropdown menus on each folder row, but
// the actual mutations live in the parent so the dashboard can update
// shared state and re-render in one place.

import { ReactNode } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Delete02Icon,
  Edit02Icon,
  FolderAddIcon,
  HashtagIcon,
  Image01Icon,
  MoreHorizontalIcon,
  PlusSignIcon,
  Share08Icon,
} from "@hugeicons/core-free-icons";

import type { FolderMeta, Tag } from "@/api";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { FolderTree } from "@/components/FolderTree";
import { cn } from "@/lib/utils";

export type ScenesScope =
  | { kind: "all" }
  | { kind: "folder"; id: string; recursive: boolean };

export interface SidebarProps {
  folders: FolderMeta[] | null;
  tags: Tag[] | null;
  scope: ScenesScope;
  activeTags: string[];
  onScopeChange: (next: ScenesScope) => void;
  onTagToggle: (name: string) => void;
  onCreateRootFolder: () => void;
  onCreateSubfolder: (parent: FolderMeta) => void;
  onRenameFolder: (folder: FolderMeta) => void;
  onMoveFolder: (folder: FolderMeta) => void;
  onEditFolderTags: (folder: FolderMeta) => void;
  onShareFolder: (folder: FolderMeta) => void;
  onDeleteFolder: (folder: FolderMeta) => void;
}

export function Sidebar({
  folders,
  tags,
  scope,
  activeTags,
  onScopeChange,
  onTagToggle,
  onCreateRootFolder,
  onCreateSubfolder,
  onRenameFolder,
  onMoveFolder,
  onEditFolderTags,
  onShareFolder,
  onDeleteFolder,
}: SidebarProps) {
  const selectedId = scope.kind === "folder" ? scope.id : null;

  return (
    <aside className="flex w-60 flex-col gap-4 border-r border-border/60 bg-card/30 px-2 py-3 text-xs/relaxed">
      <SidebarSection
        title="Scenes"
        action={
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onCreateRootFolder}
            aria-label="New folder"
          >
            <HugeiconsIcon icon={FolderAddIcon} strokeWidth={2} />
          </Button>
        }
      >
        <button
          type="button"
          onClick={() => onScopeChange({ kind: "all" })}
          data-active={scope.kind === "all"}
          className={cn(
            "flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-left transition-colors hover:bg-muted/60",
            "data-[active=true]:bg-accent data-[active=true]:text-accent-foreground"
          )}
        >
          <HugeiconsIcon icon={Image01Icon} strokeWidth={2} className="size-3.5 opacity-70" />
          <span>All scenes</span>
        </button>
        {folders === null ? (
          <ul className="flex flex-col gap-1">
            <li className="h-6 w-full animate-pulse rounded bg-muted/40" />
            <li className="h-6 w-3/4 animate-pulse rounded bg-muted/40" />
          </ul>
        ) : folders.length === 0 ? (
          <button
            type="button"
            onClick={onCreateRootFolder}
            className="mt-1 flex w-full items-center gap-1.5 rounded-md border border-dashed border-border/60 px-2 py-1.5 text-[0.6875rem] text-muted-foreground hover:bg-muted/40"
          >
            <HugeiconsIcon icon={PlusSignIcon} strokeWidth={2} className="size-3" />
            New folder
          </button>
        ) : (
          <FolderTree
            folders={folders}
            selectedId={selectedId}
            onSelect={(id) =>
              onScopeChange({ kind: "folder", id, recursive: scope.kind === "folder" ? scope.recursive : false })
            }
            renderAction={(folder) => (
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Actions for ${folder.name}`}
                      onClick={(e) => e.stopPropagation()}
                    />
                  }
                >
                  <HugeiconsIcon icon={MoreHorizontalIcon} strokeWidth={2} />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" sideOffset={4}>
                  <DropdownMenuItem onClick={() => onCreateSubfolder(folder)}>
                    <HugeiconsIcon icon={FolderAddIcon} strokeWidth={2} />
                    New subfolder
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onShareFolder(folder)}>
                    <HugeiconsIcon icon={Share08Icon} strokeWidth={2} />
                    Share folder…
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onEditFolderTags(folder)}>
                    <HugeiconsIcon icon={HashtagIcon} strokeWidth={2} />
                    Edit tags…
                  </DropdownMenuItem>
                  {!folder.isDefault ? (
                    <>
                      <DropdownMenuItem onClick={() => onRenameFolder(folder)}>
                        <HugeiconsIcon icon={Edit02Icon} strokeWidth={2} />
                        Rename
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => onMoveFolder(folder)}>
                        <HugeiconsIcon icon={FolderAddIcon} strokeWidth={2} />
                        Move to…
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        variant="destructive"
                        onClick={() => onDeleteFolder(folder)}
                      >
                        <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} />
                        Delete
                      </DropdownMenuItem>
                    </>
                  ) : null}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          />
        )}
        {scope.kind === "folder" ? (
          <label className="mt-1 flex cursor-pointer items-center gap-1.5 rounded-md px-2 py-1 text-[0.6875rem] text-muted-foreground hover:bg-muted/40">
            <input
              type="checkbox"
              className="size-3"
              checked={scope.recursive}
              onChange={(e) =>
                onScopeChange({
                  kind: "folder",
                  id: scope.id,
                  recursive: e.target.checked,
                })
              }
            />
            Include subfolders
          </label>
        ) : null}
      </SidebarSection>

      <SidebarSection title="Tags">
        {tags === null ? (
          <ul className="flex flex-col gap-1">
            <li className="h-5 w-1/2 animate-pulse rounded bg-muted/40" />
            <li className="h-5 w-2/3 animate-pulse rounded bg-muted/40" />
          </ul>
        ) : tags.length === 0 ? (
          <p className="px-2 text-[0.6875rem] text-muted-foreground">
            No tags yet.
          </p>
        ) : (
          <ul className="flex flex-col gap-0.5">
            {tags.map((t) => {
              const active = activeTags.includes(t.name);
              return (
                <li key={t.id}>
                  <button
                    type="button"
                    onClick={() => onTagToggle(t.name)}
                    data-active={active}
                    className={cn(
                      "flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-left transition-colors hover:bg-muted/60",
                      "data-[active=true]:bg-accent data-[active=true]:text-accent-foreground"
                    )}
                  >
                    <HugeiconsIcon icon={HashtagIcon} strokeWidth={2} className="size-3 opacity-70" />
                    <span className="truncate">{t.name}</span>
                    <span className="ml-auto shrink-0 text-[0.625rem] text-muted-foreground">
                      {t.sceneCount + t.folderCount}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </SidebarSection>
    </aside>
  );
}

function SidebarSection({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-1">
      <div className="flex items-center justify-between px-2">
        <h2 className="text-[0.625rem] font-semibold uppercase tracking-wide text-muted-foreground">
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}
