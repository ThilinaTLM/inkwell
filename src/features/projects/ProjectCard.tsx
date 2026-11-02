// Project card for the Projects page: icon tile, Fraunces name, status,
// 2-line description, item count and last-edited time. Hover reveals pin + ⋯.

import { MoreHorizontalIcon, PinIcon, PinOffIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Link } from "react-router-dom";
import { ProjectIcon } from "@/components/project/ProjectIcon";
import { type ProjectFields, projectStatusOf } from "@/components/project/projectStyle";
import { StatusPill } from "@/components/project/StatusPill";
import { ContextMenu, ContextMenuContent, ContextMenuTrigger } from "@/components/ui/context-menu";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { Project } from "@/data/home";
import { relTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ProjectMenuItems, useTogglePin } from "./ProjectMenuItems";

export function ProjectCard({ project }: { project: Project & ProjectFields }) {
  const togglePin = useTogglePin();
  const pinned = project.pinnedAt !== null;
  const n = project.itemCount;
  return (
    <ContextMenu>
      <ContextMenuTrigger
        render={
          <div
            data-drop-folder={project.id}
            className="group/card relative rounded-2xl outline-none data-[drop-over=true]:ring-2 data-[drop-over=true]:ring-primary/50"
          />
        }
      >
        <Link
          to={`/folders/${project.id}`}
          className="flex h-full min-h-[148px] flex-col gap-3 rounded-2xl border border-border bg-card p-4 shadow-card outline-none transition-[border-color,box-shadow] hover:border-input hover:shadow-pop focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          <div className="flex items-start gap-3">
            <ProjectIcon folder={project} size="lg" />
            <div className="min-w-0 flex-1 pt-0.5">
              <h3 className="truncate font-display text-[18px] leading-tight font-medium tracking-tight text-foreground">
                {project.name}
              </h3>
              <div className="mt-1.5 flex items-center gap-2">
                <StatusPill status={projectStatusOf(project)} />
                {pinned ? (
                  <HugeiconsIcon
                    icon={PinIcon}
                    strokeWidth={1.8}
                    aria-label="Pinned"
                    className="size-3.5 text-primary"
                  />
                ) : null}
              </div>
            </div>
          </div>
          <p
            className={cn(
              "line-clamp-2 min-h-[2.5rem] text-[13px] leading-5",
              project.description ? "text-muted-foreground" : "text-faint",
            )}
          >
            {project.description || "No description"}
          </p>
          <div className="mt-auto text-xs text-muted-foreground">
            {n} {n === 1 ? "item" : "items"} · edited {relTime(project.updatedAt)}
          </div>
        </Link>
        <div
          className={cn(
            "absolute top-3 right-3 flex gap-0.5 rounded-[10px] border border-input bg-card p-[3px] opacity-0 shadow-card transition-opacity group-focus-within/card:opacity-100 group-hover/card:opacity-100 has-[[aria-expanded=true]]:opacity-100 [@media(hover:none)_and_(pointer:coarse)]:opacity-100",
          )}
        >
          <Tooltip>
            <TooltipTrigger
              render={
                <button
                  type="button"
                  aria-label={pinned ? "Unpin from Home" : "Pin to Home"}
                  aria-pressed={pinned}
                  onClick={() => togglePin(project)}
                  className={cn(
                    "grid size-6 place-items-center rounded-md outline-none transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/40",
                    pinned && "text-primary",
                  )}
                />
              }
            >
              <HugeiconsIcon
                icon={pinned ? PinOffIcon : PinIcon}
                strokeWidth={1.8}
                className="size-3.5"
              />
            </TooltipTrigger>
            <TooltipContent>{pinned ? "Unpin from Home" : "Pin to Home"}</TooltipContent>
          </Tooltip>
          <DropdownMenu>
            <DropdownMenuTrigger
              aria-label={`More actions for ${project.name}`}
              className="grid size-6 place-items-center rounded-md outline-none transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/40 aria-expanded:bg-accent"
            >
              <HugeiconsIcon icon={MoreHorizontalIcon} strokeWidth={1.8} className="size-3.5" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <ProjectMenuItems folder={project} as="dropdown" />
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-52">
        <ProjectMenuItems folder={project} as="context" includeOpen />
      </ContextMenuContent>
    </ContextMenu>
  );
}
