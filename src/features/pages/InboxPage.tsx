// Inbox (`/inbox`): loose files at the root (folderId === null). Triage view:
// list layout, multi-select, "Move to…" as the primary action.

import { FolderTransferIcon, InboxIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { EmptyState } from "@/components/EmptyState";
import { PageContainer, PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { useInboxFiles } from "@/data/home";
import { CaptureBox } from "@/features/capture";
import { ItemCollection, toCollectionItems } from "@/features/collection";
import { openDialog } from "@/features/dialogs/dialogStore";
import { clearSelection, useSelection } from "@/lib/selection";

const SCOPE = "inbox";

function MoveSelected() {
  const sel = useSelection();
  const items = sel.scope === SCOPE ? sel.items : [];
  if (!items.length) {
    return (
      <span className="hidden text-xs text-muted-foreground sm:inline">
        Select files to move them into a project
      </span>
    );
  }
  return (
    <div className="flex items-center gap-2">
      <Button
        size="sm"
        className="rounded-[9px]"
        onClick={() => openDialog("move", { items })}
        aria-label={`Move ${items.length} selected to a project`}
      >
        <HugeiconsIcon icon={FolderTransferIcon} strokeWidth={1.8} />
        {items.length === 1 ? "Move to project…" : `Move ${items.length} to project…`}
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className="text-muted-foreground"
        onClick={() => clearSelection(SCOPE)}
      >
        Clear
      </Button>
    </div>
  );
}

export function InboxPage() {
  const files = useInboxFiles();
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
      />
      <CaptureBox folderId={null} className="mb-6" />
      <ItemCollection
        items={toCollectionItems([], files.data ?? [])}
        loading={files.isPending}
        layout="list"
        layoutToggle={false}
        filterChips
        toolbarEnd={n > 0 ? <MoveSelected /> : null}
        scope={SCOPE}
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
