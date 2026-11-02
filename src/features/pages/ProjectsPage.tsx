// All projects (`/projects`): cards grouped Pinned / Active / Paused / Done.

import { Add01Icon, ArrowDown01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { type ReactNode, useMemo, useState } from "react";
import { EmptyState } from "@/components/EmptyState";
import { PageContainer, PageHeader } from "@/components/PageHeader";
import { projectStatusOf } from "@/components/project/projectStyle";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { type Project, useProjects } from "@/data/home";
import { ProjectCard } from "@/features/projects/ProjectCard";
import { openProjectDialog } from "@/features/projects/projectDialogStore";
import { cn } from "@/lib/utils";

const GRID = "grid grid-cols-1 gap-4 sm:grid-cols-[repeat(auto-fill,minmax(280px,1fr))]";

const byName = (a: Project, b: Project) =>
  a.name.localeCompare(b.name, undefined, { sensitivity: "base" });

export function ProjectsPage() {
  const projects = useProjects();
  const sections = useMemo(() => {
    const all = projects.data ?? [];
    const pinned = all.filter((p) => p.pinnedAt !== null && projectStatusOf(p) !== "done");
    const rest = all.filter((p) => !pinned.includes(p));
    return {
      pinned: pinned.sort((a, b) => (b.pinnedAt ?? 0) - (a.pinnedAt ?? 0)),
      active: rest.filter((p) => projectStatusOf(p) === "active").sort(byName),
      paused: rest.filter((p) => projectStatusOf(p) === "paused").sort(byName),
      done: rest.filter((p) => projectStatusOf(p) === "done").sort(byName),
    };
  }, [projects.data]);
  const total = projects.data?.length ?? 0;

  return (
    <PageContainer>
      <PageHeader
        title="Projects"
        subtitle={projects.data ? `${total} ${total === 1 ? "project" : "projects"}` : "\u00A0"}
        actions={
          <Button
            className="h-9 rounded-[10px] px-3.5 text-[13px]"
            onClick={() => openProjectDialog()}
          >
            <HugeiconsIcon icon={Add01Icon} strokeWidth={2} />
            New project
          </Button>
        }
      />
      {projects.isPending ? (
        <div className={GRID} aria-hidden>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-[148px] rounded-2xl" />
          ))}
        </div>
      ) : total === 0 ? (
        <EmptyState
          title="No projects yet"
          body="A project groups related notes, boards and files in one place."
          action={<Button onClick={() => openProjectDialog()}>New project</Button>}
        />
      ) : (
        <div className="flex flex-col gap-8">
          <Section title="Pinned" projects={sections.pinned} />
          <Section title="Active" projects={sections.active} />
          <Section title="Paused" projects={sections.paused} />
          <Section title="Done" projects={sections.done} collapsible />
        </div>
      )}
    </PageContainer>
  );
}

function Section({
  title,
  projects,
  collapsible = false,
}: {
  title: string;
  projects: Project[];
  collapsible?: boolean;
}): ReactNode {
  const [open, setOpen] = useState(!collapsible);
  if (projects.length === 0) return null;
  return (
    <section aria-label={title}>
      {collapsible ? (
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
          className="mb-3 flex items-center gap-1.5 rounded text-[11px] font-semibold tracking-[0.09em] text-faint uppercase outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40"
        >
          <HugeiconsIcon
            icon={ArrowDown01Icon}
            strokeWidth={2}
            className={cn("size-3.5 transition-transform", !open && "-rotate-90")}
          />
          {title} · {projects.length}
        </button>
      ) : (
        <h2 className="mb-3 text-[11px] font-semibold tracking-[0.09em] text-faint uppercase">
          {title} · {projects.length}
        </h2>
      )}
      {open ? (
        <div className={GRID}>
          {projects.map((p) => (
            <ProjectCard key={p.id} project={p} />
          ))}
        </div>
      ) : null}
    </section>
  );
}
