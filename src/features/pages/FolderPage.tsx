// Folder page (`/folders/:folderId`). Top-level folders are projects and get
// the project header (icon tile, status, description, actions); sub-folders
// get a breadcrumb. Contents render through <ItemCollection>.

import {
  ArtboardToolIcon,
  Folder01Icon,
  MoreHorizontalIcon,
  Note01Icon,
  PinIcon,
  PinOffIcon,
  Share08Icon,
  Upload01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import { EmptyState } from "@/components/EmptyState";
import { PageContainer, PageHeader } from "@/components/PageHeader";
import { ProjectIcon } from "@/components/project/ProjectIcon";
import { type ProjectFields, projectStatusOf } from "@/components/project/projectStyle";
import { StatusPill } from "@/components/project/StatusPill";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useFiles } from "@/data/files";
import { useFolders } from "@/data/folders";
import { itemActions } from "@/features/actions/useItemActions";
import { ItemCollection, toCollectionItems } from "@/features/collection";
import { PageDropZone } from "@/features/projects/PageDropZone";
import { ProjectMenuItems, useTogglePin } from "@/features/projects/ProjectMenuItems";
import { findOverviewNote, ProjectOverview } from "@/features/projects/ProjectOverview";
import type { FolderMeta } from "@/lib/api/client";
import { CommandMenuItems } from "@/lib/commands/CommandMenuItems";
import { runCommand } from "@/lib/commands/registry";
import { NewMenu } from "./NewMenu";

const SUBFOLDER_MENU_IDS = [
  "item.move",
  "item.rename",
  "item.duplicate",
  "item.download",
  "-",
  "item.trash",
] as const;

export function FolderPage() {
  const { folderId = "" } = useParams<{ folderId: string }>();
  const folders = useFolders();
  const files = useFiles({ folderId });

  const folder = folders.data?.find((f) => f.id === folderId);
  const subfolders = useMemo(
    () => (folders.data ?? []).filter((f) => f.parentId === folderId),
    [folders.data, folderId],
  );
  const items = useMemo(
    () => toCollectionItems(subfolders, files.data ?? []),
    [subfolders, files.data],
  );
  const trail = useMemo(() => ancestors(folders.data ?? [], folder), [folders.data, folder]);
  const togglePin = useTogglePin();

  if (folders.isPending) {
    return (
      <PageContainer>
        <PageHeader title=" " />
        <ItemCollection items={[]} loading scope={`folder:${folderId}`} />
      </PageContainer>
    );
  }
  if (!folder) {
    return (
      <PageContainer>
        <EmptyState
          title="Folder not found"
          body="It may have been moved to the trash or deleted."
          action={
            <Button render={<Link to="/projects" />} variant="outline">
              Back to projects
            </Button>
          }
        />
      </PageContainer>
    );
  }

  const meta = folder as FolderMeta & ProjectFields;
  const isProject = folder.parentId === null;
  const count = (folder.fileCount ?? 0) + (folder.subfolderCount ?? 0);
  const ref = { type: "folder", id: folder.id } as const;
  const overview = isProject ? findOverviewNote(files.data ?? []) : undefined;
  const pinned = folder.pinnedAt !== null;

  return (
    <PageDropZone folderId={folder.id} name={folder.name}>
      <PageContainer>
        <PageHeader
          breadcrumb={
            isProject
              ? undefined
              : [
                  ...trail.map((f) => ({ label: f.name, to: `/folders/${f.id}` })),
                  { label: folder.name },
                ]
          }
          icon={
            isProject ? (
              <ProjectIcon folder={meta} size="xl" />
            ) : (
              <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-muted text-muted-foreground">
                <HugeiconsIcon icon={Folder01Icon} strokeWidth={1.8} className="size-6" />
              </span>
            )
          }
          title={
            isProject ? (
              <span className="flex items-center gap-3">
                <span className="truncate">{folder.name}</span>
                <StatusPill status={projectStatusOf(meta)} className="shrink-0 font-sans" />
              </span>
            ) : (
              folder.name
            )
          }
          subtitle={
            isProject && meta.description ? (
              <span className="line-clamp-2 block whitespace-normal">{meta.description}</span>
            ) : (
              `${count} ${count === 1 ? "item" : "items"}`
            )
          }
          actions={
            <>
              <Button
                variant="outline"
                className="h-9 rounded-[10px] px-3 text-[13px]"
                onClick={() => itemActions.share(ref)}
              >
                <HugeiconsIcon icon={Share08Icon} strokeWidth={1.8} />
                <span className="max-sm:sr-only">Share</span>
              </Button>
              {isProject ? (
                <Button
                  variant="outline"
                  size="icon"
                  className="size-9 rounded-[10px]"
                  aria-label={pinned ? "Unpin from Home" : "Pin to Home"}
                  aria-pressed={pinned}
                  title={pinned ? "Unpin from Home" : "Pin to Home"}
                  onClick={() => togglePin(folder)}
                >
                  <HugeiconsIcon
                    icon={pinned ? PinOffIcon : PinIcon}
                    strokeWidth={1.8}
                    className={pinned ? "text-primary" : undefined}
                  />
                </Button>
              ) : null}
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button
                      variant="outline"
                      size="icon"
                      className="size-9 rounded-[10px]"
                      aria-label="More actions"
                    />
                  }
                >
                  <HugeiconsIcon icon={MoreHorizontalIcon} strokeWidth={1.8} />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  {isProject ? (
                    <ProjectMenuItems
                      folder={folder}
                      as="dropdown"
                      extra={
                        overview ? null : (
                          <>
                            <DropdownMenuItem
                              onClick={() =>
                                void itemActions.newFile(folder.id, "notes", { name: "Overview" })
                              }
                            >
                              <HugeiconsIcon icon={Note01Icon} strokeWidth={1.8} />
                              Add overview note
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                          </>
                        )
                      }
                    />
                  ) : (
                    <CommandMenuItems
                      ids={SUBFOLDER_MENU_IDS}
                      as="dropdown"
                      ctx={{ selection: [ref], focused: ref }}
                    />
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
              <NewMenu />
            </>
          }
        />
        {overview ? <ProjectOverview note={overview} /> : null}
        <ItemCollection
          items={items}
          loading={files.isPending}
          filterChips
          scope={`folder:${folderId}`}
          ariaLabel={folder.name}
          empty={
            <EmptyState
              title="Nothing here yet"
              body="Start with a note or a whiteboard, or drop files anywhere on this page to upload."
              action={
                <div className="flex flex-wrap justify-center gap-2">
                  <Button onClick={() => runCommand("file.new.notes")}>
                    <HugeiconsIcon icon={Note01Icon} strokeWidth={1.8} />
                    Note
                  </Button>
                  <Button variant="outline" onClick={() => runCommand("file.new.excalidraw")}>
                    <HugeiconsIcon icon={ArtboardToolIcon} strokeWidth={1.8} />
                    Whiteboard
                  </Button>
                  <Button variant="outline" onClick={() => runCommand("file.upload")}>
                    <HugeiconsIcon icon={Upload01Icon} strokeWidth={1.8} />
                    Upload
                  </Button>
                </div>
              }
            />
          }
        />
      </PageContainer>
    </PageDropZone>
  );
}

/** Ancestors of `folder`, root-most first (excluding the folder itself). */
function ancestors(all: FolderMeta[], folder: FolderMeta | undefined): FolderMeta[] {
  if (!folder) return [];
  const byId = new Map(all.map((f) => [f.id, f]));
  const out: FolderMeta[] = [];
  let cur = folder.parentId ? byId.get(folder.parentId) : undefined;
  for (let guard = 0; cur && guard < 64; guard++) {
    out.unshift(cur);
    cur = cur.parentId ? byId.get(cur.parentId) : undefined;
  }
  return out;
}
