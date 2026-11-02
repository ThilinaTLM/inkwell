// Folder page (`/folders/:folderId`). Top-level folders are projects and get
// the project header (icon tile, status, description); sub-folders get a
// breadcrumb. Contents render through <ItemCollection>.

import { Folder01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import { EmptyState } from "@/components/EmptyState";
import { PageContainer, PageHeader } from "@/components/PageHeader";
import { ProjectIcon } from "@/components/project/ProjectIcon";
import { type ProjectFields, projectStatusOf } from "@/components/project/projectStyle";
import { StatusPill } from "@/components/project/StatusPill";
import { Button } from "@/components/ui/button";
import { useFiles } from "@/data/files";
import { useFolders } from "@/data/folders";
import { ItemCollection, toCollectionItems } from "@/features/collection";
import type { FolderMeta } from "@/lib/api/client";
import { NewMenu } from "./NewMenu";

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

  return (
    <PageContainer>
      <PageHeader
        breadcrumb={
          isProject
            ? undefined
            : [
                { label: "Projects", to: "/projects" },
                ...trail.map((f) => ({ label: f.name, to: `/folders/${f.id}` })),
                { label: folder.name },
              ]
        }
        icon={
          isProject ? (
            <ProjectIcon folder={meta} size="lg" />
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
        subtitle={(isProject && meta.description) || `${count} ${count === 1 ? "item" : "items"}`}
        actions={<NewMenu />}
      />
      <ItemCollection
        items={items}
        loading={files.isPending}
        filterChips
        scope={`folder:${folderId}`}
        ariaLabel={folder.name}
        empty={
          <EmptyState
            title="Nothing here yet"
            body="Create a board, note or diagram, or drop files anywhere on this page to upload."
            action={<NewMenu label="New…" mobile />}
          />
        }
      />
    </PageContainer>
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
