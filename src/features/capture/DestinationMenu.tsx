// "Saving to <place>" picker used by the capture dialog: Inbox, recent
// destinations, then every folder with its path.

import { ArrowDown01Icon, InboxIcon, Tick02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useMemo } from "react";
import { ProjectIcon } from "@/components/project/ProjectIcon";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useFolders } from "@/data/folders";
import { folderPath } from "@/data/home";
import { useRecentDestinations } from "@/features/actions/recentDestinations";
import type { FolderMeta } from "@/lib/api/client";
import { cn } from "@/lib/utils";

function pathLabel(all: FolderMeta[], id: string): string {
  return folderPath(all, id)
    .map((c) => c.name)
    .join(" / ");
}

function Tile({ folder }: { folder: FolderMeta | null }) {
  if (!folder) {
    return (
      <span className="grid size-5 shrink-0 place-items-center rounded-md bg-accent-soft text-accent-text">
        <HugeiconsIcon icon={InboxIcon} strokeWidth={1.8} className="size-3" />
      </span>
    );
  }
  return <ProjectIcon folder={folder.parentId ? null : folder} size="xs" />;
}

export function DestinationMenu({
  value,
  onChange,
  className,
}: {
  value: string | null;
  onChange: (folderId: string | null) => void;
  className?: string;
}) {
  const foldersQ = useFolders();
  const all = useMemo(() => foldersQ.data ?? [], [foldersQ.data]);
  const recentIds = useRecentDestinations();
  const current = value ? (all.find((f) => f.id === value) ?? null) : null;

  const list = useMemo(
    () =>
      all
        .map((f) => ({ f, label: pathLabel(all, f.id) }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    [all],
  );
  const recent = recentIds
    .filter((id): id is string => id !== null && all.some((f) => f.id === id))
    .slice(0, 4);

  const row = (f: FolderMeta | null, label: string, key: string) => (
    <DropdownMenuItem key={key} onClick={() => onChange(f?.id ?? null)}>
      <Tile folder={f} />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {(f?.id ?? null) === value ? (
        <HugeiconsIcon icon={Tick02Icon} strokeWidth={2} className="size-3.5 text-primary" />
      ) : null}
    </DropdownMenuItem>
  );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Change destination"
        className={cn(
          "inline-flex h-7 max-w-full items-center gap-1.5 rounded-lg border border-border bg-surface-2 px-2 text-[13px] font-medium text-foreground outline-none transition-colors hover:border-input focus-visible:ring-2 focus-visible:ring-ring/40 aria-expanded:border-input",
          className,
        )}
      >
        <Tile folder={current} />
        <span className="truncate">
          {current ? pathLabel(all, current.id) : value ? "Folder" : "Inbox"}
        </span>
        <HugeiconsIcon
          icon={ArrowDown01Icon}
          strokeWidth={2}
          className="size-3 shrink-0 text-muted-foreground"
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-80 w-72 overflow-y-auto">
        <DropdownMenuGroup>
          {row(null, "Inbox", "inbox")}
          {recent.length ? <DropdownMenuLabel>Recent</DropdownMenuLabel> : null}
          {recent.map((id) =>
            row(all.find((f) => f.id === id) ?? null, pathLabel(all, id), `r-${id}`),
          )}
          {list.length ? <DropdownMenuLabel>All folders</DropdownMenuLabel> : null}
          {list.map(({ f, label }) => row(f, label, f.id))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
