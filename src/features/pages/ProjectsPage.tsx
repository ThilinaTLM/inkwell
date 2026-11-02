// All projects (`/projects`): top-level folders.

import { Add01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { EmptyState } from "@/components/EmptyState";
import { PageContainer, PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { useFolders } from "@/data/folders";
import { itemActions } from "@/features/actions/useItemActions";
import { ItemCollection, toCollectionItems } from "@/features/collection";

export function ProjectsPage() {
  const folders = useFolders();
  const projects = (folders.data ?? []).filter((f) => f.parentId === null);
  const newProject = () => itemActions.newFolder(null);
  return (
    <PageContainer>
      <PageHeader
        title="Projects"
        subtitle={
          folders.data
            ? `${projects.length} ${projects.length === 1 ? "project" : "projects"}`
            : " "
        }
        actions={
          <Button className="h-9 rounded-[10px] px-3.5 text-[13px]" onClick={newProject}>
            <HugeiconsIcon icon={Add01Icon} strokeWidth={2} />
            New project
          </Button>
        }
      />
      <ItemCollection
        items={toCollectionItems(projects, [])}
        loading={folders.isPending}
        scope="projects"
        ariaLabel="Projects"
        empty={
          <EmptyState
            title="No projects yet"
            body="A project is a top-level folder. Group related boards, notes and files together."
            action={<Button onClick={newProject}>New project</Button>}
          />
        }
      />
    </PageContainer>
  );
}
