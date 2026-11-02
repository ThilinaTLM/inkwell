// Home (`/`): greeting, capture box, Continue, Pinned projects, Inbox preview.

import { InboxIcon, Pin02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { PageContainer } from "@/components/PageHeader";
import { ProjectIcon } from "@/components/project/ProjectIcon";
import { StatusPill } from "@/components/project/StatusPill";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useMe } from "@/data/auth";
import {
  type Project,
  useInboxFiles,
  usePinnedProjects,
  useProjects,
  useRecentFiles,
} from "@/data/home";
import { CaptureBox } from "@/features/capture";
import { InboxRow } from "@/features/capture/InboxRow";
import { ItemCollection, toCollectionItems } from "@/features/collection";
import { openDialog } from "@/features/dialogs/dialogStore";
import { relTime } from "@/lib/format";
import { cn } from "@/lib/utils";

function greeting(): string {
  const h = new Date().getHours();
  if (h < 5) return "Late night";
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

function SectionHeader({
  id,
  title,
  to,
  linkLabel,
}: {
  id: string;
  title: string;
  to?: string;
  linkLabel?: string;
}) {
  return (
    <div className="mb-3.5 flex items-baseline justify-between">
      <h2 id={id} className="font-display text-xl font-medium tracking-tight">
        {title}
      </h2>
      {to ? (
        <Link
          to={to}
          className="rounded text-[13px] text-muted-foreground outline-none hover:text-primary focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          {linkLabel}
        </Link>
      ) : null}
    </div>
  );
}

function ProjectCard({ project }: { project: Project }) {
  const n = project.itemCount;
  return (
    <Link
      to={`/folders/${project.id}`}
      data-drop-folder={project.id}
      className="group/pc flex flex-col gap-3 rounded-[14px] border border-border bg-card p-4 shadow-card outline-none transition-[transform,box-shadow,border-color] hover:-translate-y-0.5 hover:border-input hover:shadow-pop focus-visible:ring-2 focus-visible:ring-ring/50"
    >
      <div className="flex items-center gap-3">
        <ProjectIcon folder={project} size="md" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[14.5px] font-semibold text-foreground">{project.name}</div>
          <div className="text-xs text-muted-foreground">
            {n} {n === 1 ? "item" : "items"}
          </div>
        </div>
        <StatusPill status={project.status} />
      </div>
      <div className="text-xs text-faint">Edited {relTime(project.updatedAt)}</div>
    </Link>
  );
}

export function HomePage() {
  const me = useMe();
  const navigate = useNavigate();
  const recent = useRecentFiles(4);
  const projects = useProjects();
  const pinned = usePinnedProjects();
  const inbox = useInboxFiles();

  const first = me.data?.firstName?.trim();
  const today = new Date().toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  const inboxCount = inbox.data?.length ?? 0;

  const recentItems = useMemo(() => toCollectionItems([], recent.data ?? []), [recent.data]);

  // Pinned projects, or (when nothing is pinned) the 3 most recently active.
  const hasPins = (pinned.data?.length ?? 0) > 0;
  const shownProjects = useMemo(() => {
    if (hasPins) return pinned.data ?? [];
    return [...(projects.data ?? [])].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 3);
  }, [hasPins, pinned.data, projects.data]);

  const noProjects = projects.data?.length === 0;
  const noFiles = recent.data?.length === 0 && inboxCount === 0;

  return (
    <PageContainer className="max-w-[1060px] md:pt-12">
      <header className="mb-6">
        <h1 className="font-display text-[32px] leading-[1.15] font-normal tracking-[-0.02em] md:text-[38px]">
          {greeting()}
          {first ? (
            <>
              , <em className="text-primary">{first}</em>
            </>
          ) : null}
        </h1>
        <p className="mt-1 text-sm text-faint">
          {today}
          {inbox.data ? (
            <>
              {" · "}
              {inboxCount > 0 ? (
                <Link to="/inbox" className="hover:text-primary hover:underline">
                  {inboxCount} {inboxCount === 1 ? "thing" : "things"} waiting in your inbox
                </Link>
              ) : (
                "Inbox is clear"
              )}
            </>
          ) : null}
        </p>
      </header>

      <CaptureBox folderId={null} />

      {noProjects && noFiles ? (
        <section className="mt-12 rounded-2xl border border-dashed border-input bg-surface-2 px-6 py-10 text-center">
          <h2 className="font-display text-2xl font-normal italic">Start with a project</h2>
          <p className="mx-auto mt-2 max-w-md text-sm/relaxed text-muted-foreground">
            Projects keep notes, whiteboards and files for one piece of work together. Anything you
            capture above waits in your Inbox until you file it.
          </p>
          <Button
            className="mt-5"
            onClick={() =>
              openDialog("newFolder", {
                parentId: null,
                onCreated: (f) => navigate(`/folders/${f.id}`),
              })
            }
          >
            Create your first project
          </Button>
        </section>
      ) : (
        <>
          {recent.isPending || (recent.data && recent.data.length > 0) ? (
            <section aria-labelledby="home-continue" className="mt-10">
              <SectionHeader
                id="home-continue"
                title="Continue where you left off"
                to="/files/recent"
                linkLabel="View all recent"
              />
              <ItemCollection
                items={recentItems}
                loading={recent.isPending}
                layout="cards"
                showLocation
                layoutToggle={false}
                sort={false}
                scope="home"
                ariaLabel="Recent files"
              />
            </section>
          ) : null}

          <section aria-labelledby="home-pinned" className="mt-10">
            <SectionHeader
              id="home-pinned"
              title={hasPins ? "Pinned projects" : "Projects"}
              to="/projects"
              linkLabel="All projects"
            />
            {projects.isPending ? (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {["a", "b", "c"].map((k) => (
                  <Skeleton key={k} className="h-[104px] rounded-[14px]" />
                ))}
              </div>
            ) : shownProjects.length ? (
              <>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {shownProjects.map((p) => (
                    <ProjectCard key={p.id} project={p} />
                  ))}
                </div>
                {!hasPins ? (
                  <p className="mt-3 flex items-center gap-1.5 text-xs text-faint">
                    <HugeiconsIcon icon={Pin02Icon} strokeWidth={1.8} className="size-3.5" />
                    Pin projects to keep them here.
                  </p>
                ) : null}
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                No projects yet.{" "}
                <button
                  type="button"
                  className="text-primary hover:underline"
                  onClick={() => openDialog("newFolder", { parentId: null })}
                >
                  Create one
                </button>
              </p>
            )}
          </section>

          <section aria-labelledby="home-inbox" className="mt-10">
            <SectionHeader
              id="home-inbox"
              title="Inbox"
              to={inboxCount > 0 ? "/inbox" : undefined}
              linkLabel={inboxCount > 5 ? `View all ${inboxCount}` : "View all"}
            />
            <div
              className={cn(
                "overflow-hidden rounded-[14px] border border-border bg-card shadow-card",
              )}
            >
              {inbox.isPending ? (
                <div className="space-y-2 p-3">
                  <Skeleton className="h-9" />
                  <Skeleton className="h-9" />
                </div>
              ) : inboxCount === 0 ? (
                <div className="flex items-center gap-3 px-4 py-5 text-sm text-muted-foreground">
                  <HugeiconsIcon icon={InboxIcon} strokeWidth={1.6} className="size-5 text-faint" />
                  Nothing waiting. Captures and loose files land here until you file them.
                </div>
              ) : (
                (inbox.data ?? []).slice(0, 5).map((f) => <InboxRow key={f.id} file={f} />)
              )}
            </div>
          </section>
        </>
      )}
    </PageContainer>
  );
}
