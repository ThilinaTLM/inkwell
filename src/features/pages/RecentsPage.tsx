// Recents (`/recents`): files you edited lately across every project (and loose
// files), newest first. Quick-create sits at the top; the header, create row and
// toolbar stay fixed while the list is the page's only scroll region.

import { PageContainer, PageHeader } from "@/components/PageHeader";
import { RecentFilesTab } from "@/features/library/ItemTabs";
import { QuickCreate } from "./QuickCreate";

export function RecentsPage() {
  return (
    <PageContainer fixed>
      <PageHeader title="Recents" subtitle="What you edited lately, across all projects." />
      <QuickCreate variant="compact" />
      <RecentFilesTab />
    </PageContainer>
  );
}
