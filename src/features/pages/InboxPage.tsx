// Inbox (`/inbox`): loose files at the root (folderId === null).

import { InboxIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { EmptyState } from "@/components/EmptyState";
import { PageContainer, PageHeader } from "@/components/PageHeader";
import { useFiles } from "@/data/files";
import { ItemCollection, toCollectionItems } from "@/features/collection";
import { NewMenu } from "./NewMenu";

const ROOT = { folderId: "root" } as const;

export function InboxPage() {
  const files = useFiles(ROOT);
  const n = files.data?.length ?? 0;
  return (
    <PageContainer>
      <PageHeader
        title="Inbox"
        icon={
          <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent-text">
            <HugeiconsIcon icon={InboxIcon} strokeWidth={1.8} className="size-6" />
          </span>
        }
        subtitle={
          files.data ? `${n} loose ${n === 1 ? "file" : "files"} · not in a project yet` : " "
        }
        actions={<NewMenu />}
      />
      <ItemCollection
        items={toCollectionItems([], files.data ?? [])}
        loading={files.isPending}
        filterChips
        scope="inbox"
        ariaLabel="Inbox"
        empty={
          <EmptyState
            title="Inbox zero"
            body="Quick captures and loose files land here until you move them into a project."
          />
        }
      />
    </PageContainer>
  );
}
