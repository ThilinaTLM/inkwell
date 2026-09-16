// ItemMenu — the "…" overflow menu shown on every file/folder tile and
// row. It mirrors the right-click `<ItemContextMenu>` exactly; both are
// driven by the same `ItemMenuActions` table, so a pointer user, a
// touch user and a keyboard user all reach the same operations.

import {
  Delete02Icon,
  Download01Icon,
  Edit02Icon,
  FolderAddIcon,
  HashtagIcon,
  Link04Icon,
  MoreHorizontalIcon,
  PlusSignIcon,
  Share08Icon,
  TaskDone01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import { downloadLabelForKind } from "@/components/file-kinds/file-kind-icons";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { FileMeta, FolderMeta } from "@/lib/api/client";
import { files } from "@/lib/api/client";
import { cn } from "@/lib/utils";

import type { ItemMenuActions } from "../ItemContextMenu";

type Target = { kind: "file"; file: FileMeta } | { kind: "folder"; folder: FolderMeta };

export function ItemMenu({
  target,
  actions,
  className,
}: {
  target: Target;
  actions: ItemMenuActions;
  className?: string;
}) {
  const name = target.kind === "file" ? target.file.name : target.folder.name;
  return (
    // The wrapper (not the trigger) swallows the click so the enclosing
    // tile/row doesn't also navigate. Putting `stopPropagation` on the
    // trigger itself would race Base UI's own click handler.
    // biome-ignore lint/a11y/noStaticElementInteractions: the span only swallows bubbling clicks; the trigger inside is the interactive element
    // biome-ignore lint/a11y/useKeyWithClickEvents: keyboard users reach the trigger directly, no key handler needed here
    <span onClick={(e) => e.stopPropagation()}>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label={`Actions for ${name}`}
              className={cn("text-muted-foreground", className)}
            />
          }
        >
          <HugeiconsIcon icon={MoreHorizontalIcon} strokeWidth={2} />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" sideOffset={4} className="min-w-48">
          {target.kind === "file" ? (
            <FileItems file={target.file} actions={actions} />
          ) : (
            <FolderItems folder={target.folder} actions={actions} />
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </span>
  );
}

function FileItems({ file: s, actions }: { file: FileMeta; actions: ItemMenuActions }) {
  return (
    <>
      <DropdownMenuItem onClick={() => actions.openFile(s)}>
        <HugeiconsIcon icon={TaskDone01Icon} strokeWidth={2} />
        Open
      </DropdownMenuItem>
      <DropdownMenuItem onClick={() => window.open(`/f/${s.id}`, "_blank", "noopener")}>
        <HugeiconsIcon icon={Link04Icon} strokeWidth={2} />
        Open in new tab
      </DropdownMenuItem>
      <DropdownMenuItem onClick={() => actions.shareFile(s)}>
        <HugeiconsIcon icon={Share08Icon} strokeWidth={2} />
        Share
      </DropdownMenuItem>
      <DropdownMenuItem
        render={
          <a href={files.downloadUrl(s.id)} download>
            <HugeiconsIcon icon={Download01Icon} strokeWidth={2} />
            {downloadLabelForKind(s.kind)}
          </a>
        }
      />
      <DropdownMenuSeparator />
      <DropdownMenuItem onClick={() => actions.editFileTags(s)}>
        <HugeiconsIcon icon={HashtagIcon} strokeWidth={2} />
        Edit tags…
      </DropdownMenuItem>
      <DropdownMenuItem onClick={() => actions.moveFile(s)}>
        <HugeiconsIcon icon={FolderAddIcon} strokeWidth={2} />
        Move to…
      </DropdownMenuItem>
      <DropdownMenuItem onClick={() => actions.renameFile(s)}>
        <HugeiconsIcon icon={Edit02Icon} strokeWidth={2} />
        Rename
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem variant="destructive" onClick={() => actions.deleteFile(s)}>
        <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} />
        Delete
      </DropdownMenuItem>
    </>
  );
}

function FolderItems({ folder: f, actions }: { folder: FolderMeta; actions: ItemMenuActions }) {
  return (
    <>
      <DropdownMenuItem onClick={() => actions.openFolder(f)}>
        <HugeiconsIcon icon={TaskDone01Icon} strokeWidth={2} />
        Open
      </DropdownMenuItem>
      <DropdownMenuItem onClick={() => actions.shareFolder(f)}>
        <HugeiconsIcon icon={Share08Icon} strokeWidth={2} />
        Share
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem onClick={() => actions.openNewFilePicker(f.id)}>
        <HugeiconsIcon icon={PlusSignIcon} strokeWidth={2} />
        New file inside…
      </DropdownMenuItem>
      <DropdownMenuItem onClick={() => actions.createFolderIn(f.id)}>
        <HugeiconsIcon icon={FolderAddIcon} strokeWidth={2} />
        New subfolder
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem onClick={() => actions.editFolderTags(f)}>
        <HugeiconsIcon icon={HashtagIcon} strokeWidth={2} />
        Edit tags…
      </DropdownMenuItem>
      <DropdownMenuItem onClick={() => actions.moveFolder(f)}>
        <HugeiconsIcon icon={FolderAddIcon} strokeWidth={2} />
        Move to…
      </DropdownMenuItem>
      <DropdownMenuItem onClick={() => actions.renameFolder(f)}>
        <HugeiconsIcon icon={Edit02Icon} strokeWidth={2} />
        Rename
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem variant="destructive" onClick={() => actions.deleteFolder(f)}>
        <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} />
        Delete
      </DropdownMenuItem>
    </>
  );
}
