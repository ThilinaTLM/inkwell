// Files hub (`/files/:tab?`): All · Starred · Shared · Trash. (Recent files live on /recents.)
// Header and tabs are fixed; each tab has exactly one scroll region.

import { Link, Navigate, useParams } from "react-router-dom";
import { PageContainer, PageHeader, PageScroll } from "@/components/PageHeader";
import { AllFilesTab, StarredTab } from "@/features/library/ItemTabs";
import { TrashTab } from "@/features/library/TrashTab";
import { SharedTab } from "@/features/sharing/SharesPage";
import { cn } from "@/lib/utils";

const TABS = [
  { id: "all", label: "All" },
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
    <div role="tablist" aria-label="Files" className="flex shrink-0 gap-1 border-b border-border">
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
  starred: "Files and folders you starred.",
  shared: "Links you have shared with others.",
  trash: "Deleted items you can still restore.",
};

export function FilesPage() {
  const { tab = "all" } = useParams<{ tab?: string }>();
  if (tab === "recent") return <Navigate to="/recents" replace />;
  if (!isTab(tab)) return <Navigate to="/files" replace />;
  return (
    <PageContainer fixed>
      <PageHeader title="Files" subtitle={SUBTITLES[tab]} />
      <FilesTabs active={tab} />
      {tab === "all" ? <AllFilesTab /> : null}
      {tab === "starred" ? <StarredTab /> : null}
      {tab === "shared" ? (
        <PageScroll>
          <SharedTab />
        </PageScroll>
      ) : null}
      {tab === "trash" ? (
        <PageScroll>
          <TrashTab />
        </PageScroll>
      ) : null}
    </PageContainer>
  );
}
