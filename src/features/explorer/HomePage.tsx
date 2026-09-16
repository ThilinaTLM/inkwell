// HomePage — the landing view at `/`.
//
// Three bands, top to bottom:
//   1. a "create new" row driven by the file-kind registry, so every
//      supported kind (and every future one) gets an equal entry point,
//   2. recently updated files, grouped by day buckets,
//   3. a link into the full file list.
//
// Recency is `updatedAt`, which is what the API already sorts by, so
// this view is a slice of the shared `useAllFiles` cache rather than a
// new query.

import { ArrowRight01Icon, File01Icon, FolderAddIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useEffect } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

import { EmptyState } from "@/components/EmptyState";
import { FileKindGlyph } from "@/components/file-kinds/file-kind-icons";
import { AppShell } from "@/components/layout/AppShell";
import { PageHeader, SectionHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { useMe } from "@/data/auth";
import { useAllFiles } from "@/data/files";
import { useFolders } from "@/data/folders";
import { FILE_KIND_LIST } from "@/lib/file-kinds";
import { userDisplayName } from "@/lib/user";
import { cn } from "@/lib/utils";

import { useItemActions } from "./ExplorerActionsProvider";
import { ItemContextMenu } from "./ItemContextMenu";
import { FileGridCard } from "./items/FileGridCard";
import { ItemGridSkeleton } from "./items/ItemGrid";
import { folderNameMap, groupByRecency } from "./lib/sortFiles";

const RECENT_LIMIT = 18;

export function HomePage() {
  // Legacy `/?folder=<id>` bookmarks (pre-redesign the root was the
  // folder browser). Rewrite to the canonical path with `replace` so the
  // legacy form never enters the history stack.
  const [legacyParams] = useSearchParams();
  const navigate = useNavigate();
  const legacyFolder = legacyParams.get("folder");
  useEffect(() => {
    if (legacyFolder) navigate(`/folders/${legacyFolder}`, { replace: true });
  }, [legacyFolder, navigate]);

  return (
    <AppShell>
      <HomeView />
    </AppShell>
  );
}

function HomeView() {
  const me = useMe();
  const actions = useItemActions();
  const filesQuery = useAllFiles();
  const foldersQuery = useFolders();

  const files = filesQuery.data ?? null;
  const names = folderNameMap(foldersQuery.data);
  const recent = files ? groupByRecency(files.slice(0, RECENT_LIMIT)) : [];
  const firstName = me.data ? userDisplayName(me.data).split(" ")[0] : "";

  return (
    <div className="flex flex-col gap-6 py-4">
      <PageHeader
        title={firstName ? `Welcome back, ${firstName}` : "Home"}
        description="Pick up where you left off, or start something new."
      />

      {/* Create new */}
      <section className="flex flex-col gap-2">
        <SectionHeader title="Create" />
        <div className="grid gap-2 [grid-template-columns:repeat(auto-fill,minmax(200px,1fr))]">
          {FILE_KIND_LIST.map((k) => (
            <button
              key={k.id}
              type="button"
              onClick={() => actions.createFile(k.id, null)}
              className={cn(
                "group flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2.5 text-left transition-colors",
                "hover:border-ring/40 hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              )}
            >
              <span
                className={cn("grid size-8 shrink-0 place-items-center rounded-md", k.tintClass)}
              >
                <FileKindGlyph kind={k.id} className="size-4" />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-xs font-medium text-foreground">
                  {k.label}
                </span>
                <span className="block truncate text-[0.6875rem] text-muted-foreground">
                  {k.description}
                </span>
              </span>
            </button>
          ))}
          <button
            type="button"
            onClick={() => actions.createFolderIn(null)}
            className={cn(
              "group flex items-center gap-3 rounded-lg border border-dashed border-input bg-card/40 px-3 py-2.5 text-left transition-colors",
              "hover:border-ring/40 hover:bg-accent/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            )}
          >
            <span className="grid size-8 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground">
              <HugeiconsIcon icon={FolderAddIcon} strokeWidth={1.7} className="size-4" />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-xs font-medium text-foreground">New folder</span>
              <span className="block truncate text-[0.6875rem] text-muted-foreground">
                Organise files by project.
              </span>
            </span>
          </button>
        </div>
      </section>

      {/* Recent */}
      <section className="flex flex-col gap-3">
        <SectionHeader
          title="Recent"
          description="Your most recently updated files."
          actions={
            <Button variant="ghost" size="sm" render={<Link to="/files" />}>
              All files
              <HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={2} />
            </Button>
          }
        />

        {files === null ? (
          <ItemGridSkeleton count={6} />
        ) : files.length === 0 ? (
          <EmptyState
            icon={File01Icon}
            title="No files yet"
            description="Create your first drawing, diagram, note or site above."
          />
        ) : (
          recent.map((group) => (
            <div key={group.label} className="flex flex-col gap-2">
              <h3 className="text-[0.6875rem] font-medium uppercase tracking-wide text-muted-foreground/70">
                {group.label}
              </h3>
              <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(168px,1fr))]">
                {group.files.map((f) => (
                  <ItemContextMenu key={f.id} target={{ kind: "file", file: f }} actions={actions}>
                    <FileGridCard
                      file={f}
                      actions={actions}
                      folderName={f.folderId ? (names.get(f.folderId) ?? null) : null}
                    />
                  </ItemContextMenu>
                ))}
              </div>
            </div>
          ))
        )}
      </section>
    </div>
  );
}
