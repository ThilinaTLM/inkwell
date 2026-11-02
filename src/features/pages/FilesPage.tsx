// Files hub (`/files/:tab?`): All · Recent · Starred · Shared · Trash.
// Stage 1: "All" is a flat, type-filterable ItemCollection; the other tabs
// host the legacy library pages until Stage 2 replaces them.

import { Link, Navigate, useParams } from "react-router-dom";
import { PageContainer, PageHeader } from "@/components/PageHeader";
import { useFiles } from "@/data/files";
import { ItemCollection, toCollectionItems } from "@/features/collection";
import { RecentPage } from "@/features/library/RecentPage";
import { StarredPage } from "@/features/library/StarredPage";
import { TrashPage } from "@/features/library/TrashPage";
import { SharesPage } from "@/features/sharing/SharesPage";
import { cn } from "@/lib/utils";

const TABS = [
  { id: "all", label: "All" },
  { id: "recent", label: "Recent" },
  { id: "starred", label: "Starred" },
  { id: "shared", label: "Shared" },
  { id: "trash", label: "Trash" },
] as const;
type TabId = (typeof TABS)[number]["id"];

function isTab(v: string): v is TabId {
  return TABS.some((t) => t.id === v);
}

export function FilesTabs({ active }: { active: TabId }) {
  return (
    <div role="tablist" aria-label="Files" className="flex gap-1 border-b border-border">
      {TABS.map((t) => (
        <Link
          key={t.id}
          role="tab"
          aria-selected={active === t.id}
          to={t.id === "all" ? "/files" : `/files/${t.id}`}
          className={cn(
            "-mb-px border-b-2 px-3 py-2 text-[13px] font-medium outline-none transition-colors focus-visible:text-foreground",
            active === t.id
              ? "border-primary text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground",
          )}
        >
          {t.label}
        </Link>
      ))}
    </div>
  );
}

export function FilesPage() {
  const { tab = "all" } = useParams<{ tab?: string }>();
  if (!isTab(tab)) return <Navigate to="/files" replace />;
  if (tab === "all") return <AllFiles />;

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="px-4 pt-4 sm:px-8">
        <FilesTabs active={tab} />
      </div>
      {tab === "recent" ? <RecentPage /> : null}
      {tab === "starred" ? <StarredPage /> : null}
      {tab === "shared" ? <SharesPage /> : null}
      {tab === "trash" ? <TrashPage /> : null}
    </div>
  );
}

function AllFiles() {
  const files = useFiles({});
  return (
    <PageContainer>
      <PageHeader title="Files" subtitle="Everything you own, across projects." />
      <FilesTabs active="all" />
      <div className="pt-5">
        <ItemCollection
          items={toCollectionItems([], files.data ?? [])}
          loading={files.isPending}
          filterChips
          showLocation
          scope="files"
          ariaLabel="All files"
        />
      </div>
    </PageContainer>
  );
}
