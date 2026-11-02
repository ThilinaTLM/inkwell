// Files hub (`/files/:tab?`): All · Recent · Starred · Shared · Trash.
// Every tab is built on ItemCollection (All/Recent/Starred) or a matching
// grouped/list view (Shared, Trash).

import { Link, Navigate, useParams } from "react-router-dom";
import { PageContainer, PageHeader } from "@/components/PageHeader";
import { AllFilesTab, RecentFilesTab, StarredTab } from "@/features/library/ItemTabs";
import { TrashTab } from "@/features/library/TrashTab";
import { SharedTab } from "@/features/sharing/SharesPage";
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

const SUBTITLES: Record<TabId, string> = {
  all: "Everything you own, across projects.",
  recent: "What you edited lately.",
  starred: "Files and folders you starred.",
  shared: "Links you have shared with others.",
  trash: "Deleted items you can still restore.",
};

export function FilesPage() {
  const { tab = "all" } = useParams<{ tab?: string }>();
  if (!isTab(tab)) return <Navigate to="/files" replace />;
  return (
    <PageContainer>
      <PageHeader title="Files" subtitle={SUBTITLES[tab]} />
      <FilesTabs active={tab} />
      <div className="pt-5">
        {tab === "all" ? <AllFilesTab /> : null}
        {tab === "recent" ? <RecentFilesTab /> : null}
        {tab === "starred" ? <StarredTab /> : null}
        {tab === "shared" ? <SharedTab /> : null}
        {tab === "trash" ? <TrashTab /> : null}
      </div>
    </PageContainer>
  );
}
