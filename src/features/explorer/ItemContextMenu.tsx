// ItemContextMenu — right-click menu for explorer items.
//
// Renders a `<ContextMenuTrigger>` around its children and a
// `<ContextMenuContent>` populated with the items appropriate for the
// target kind:
//
//   file   → Open · Open in new tab · Share · Download · Edit tags ·
//            Move to · Rename · Delete
//   folder → Open · Share · New file inside… · New subfolder ·
//            Edit tags · Move to · Rename · Delete
//   empty  → New file… · New folder
//
// "New file…" opens the `<NewFileDialog>` picker (rendered by the
// dashboard) so the user chooses Excalidraw / Draw.io there — the
// menu itself stays a single line per location.
//
// "empty" is used for the right-click background of the Browse grid so
// users can create items without first selecting one.
//
// The action handlers come in via `actions` so the consumer (the
// dashboard) keeps full control of the rename/delete/share dialogs and
// API calls. This component is purely presentational.

import {
  Delete02Icon,
  Download01Icon,
  Edit02Icon,
  FolderAddIcon,
  HashtagIcon,
  Link04Icon,
  PlusSignIcon,
  Share08Icon,
  TaskDone01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import type { FileMeta, FolderMeta } from "@/lib/api/client";
import { files } from "@/lib/api/client";

export type ItemContextMenuTarget =
  | { kind: "file"; file: FileMeta }
  | { kind: "folder"; folder: FolderMeta }
  | { kind: "empty"; folderId: string | null };

export interface ItemMenuActions {
  openFile: (s: FileMeta) => void;
  openFolder: (f: FolderMeta) => void;
  shareFile: (s: FileMeta) => void;
  shareFolder: (f: FolderMeta) => void;
  editFileTags: (s: FileMeta) => void;
  editFolderTags: (f: FolderMeta) => void;
  moveFile: (s: FileMeta) => void;
  moveFolder: (f: FolderMeta) => void;
  renameFile: (s: FileMeta) => void;
  renameFolder: (f: FolderMeta) => void;
  deleteFile: (s: FileMeta) => void;
  deleteFolder: (f: FolderMeta) => void;
  /** Open the file-kind picker, creating into `folderId` (or root when null). */
  openNewFilePicker: (folderId: string | null) => void;
  createFolderIn: (parentId: string | null) => void;
}

interface ItemContextMenuProps {
  target: ItemContextMenuTarget;
  actions: ItemMenuActions;
  children: React.ReactNode;
  className?: string;
}

export function ItemContextMenu({ target, actions, children, className }: ItemContextMenuProps) {
  return (
    <ContextMenu>
      <ContextMenuTrigger className={className}>{children}</ContextMenuTrigger>
      <ContextMenuContent>
        {target.kind === "file" ? (
          <FileItems file={target.file} actions={actions} />
        ) : target.kind === "folder" ? (
          <FolderItems folder={target.folder} actions={actions} />
        ) : (
          <EmptyItems folderId={target.folderId} actions={actions} />
        )}
      </ContextMenuContent>
    </ContextMenu>
  );
}

function FileItems({ file: s, actions }: { file: FileMeta; actions: ItemMenuActions }) {
  return (
    <>
      <ContextMenuItem onClick={() => actions.openFile(s)}>
        <HugeiconsIcon icon={TaskDone01Icon} strokeWidth={2} />
        Open
      </ContextMenuItem>
      <ContextMenuItem onClick={() => window.open(`/f/${s.id}`, "_blank", "noopener")}>
        <HugeiconsIcon icon={Link04Icon} strokeWidth={2} />
        Open in new tab
      </ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem onClick={() => actions.shareFile(s)}>
        <HugeiconsIcon icon={Share08Icon} strokeWidth={2} />
        Share…
      </ContextMenuItem>
      <ContextMenuItem
        render={
          <a href={files.downloadUrl(s.id)} download>
            <HugeiconsIcon icon={Download01Icon} strokeWidth={2} />
            Download
          </a>
        }
      />
      <ContextMenuItem onClick={() => actions.editFileTags(s)}>
        <HugeiconsIcon icon={HashtagIcon} strokeWidth={2} />
        Edit tags…
      </ContextMenuItem>
      <ContextMenuItem onClick={() => actions.moveFile(s)}>
        <HugeiconsIcon icon={FolderAddIcon} strokeWidth={2} />
        Move to…
      </ContextMenuItem>
      <ContextMenuItem onClick={() => actions.renameFile(s)}>
        <HugeiconsIcon icon={Edit02Icon} strokeWidth={2} />
        Rename
      </ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem variant="destructive" onClick={() => actions.deleteFile(s)}>
        <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} />
        Delete
      </ContextMenuItem>
    </>
  );
}

function FolderItems({ folder: f, actions }: { folder: FolderMeta; actions: ItemMenuActions }) {
  return (
    <>
      <ContextMenuItem onClick={() => actions.openFolder(f)}>
        <HugeiconsIcon icon={TaskDone01Icon} strokeWidth={2} />
        Open
      </ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem onClick={() => actions.shareFolder(f)}>
        <HugeiconsIcon icon={Share08Icon} strokeWidth={2} />
        Share…
      </ContextMenuItem>
      <ContextMenuItem onClick={() => actions.openNewFilePicker(f.id)}>
        <PlusGlyph />
        New file inside…
      </ContextMenuItem>
      <ContextMenuItem onClick={() => actions.createFolderIn(f.id)}>
        <HugeiconsIcon icon={FolderAddIcon} strokeWidth={2} />
        New subfolder
      </ContextMenuItem>
      <ContextMenuItem onClick={() => actions.editFolderTags(f)}>
        <HugeiconsIcon icon={HashtagIcon} strokeWidth={2} />
        Edit tags…
      </ContextMenuItem>
      <ContextMenuItem onClick={() => actions.moveFolder(f)}>
        <HugeiconsIcon icon={FolderAddIcon} strokeWidth={2} />
        Move to…
      </ContextMenuItem>
      <ContextMenuItem onClick={() => actions.renameFolder(f)}>
        <HugeiconsIcon icon={Edit02Icon} strokeWidth={2} />
        Rename
      </ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem variant="destructive" onClick={() => actions.deleteFolder(f)}>
        <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} />
        Delete
      </ContextMenuItem>
    </>
  );
}

function EmptyItems({ folderId, actions }: { folderId: string | null; actions: ItemMenuActions }) {
  return (
    <>
      <ContextMenuItem onClick={() => actions.openNewFilePicker(folderId)}>
        <PlusGlyph />
        New file…
      </ContextMenuItem>
      <ContextMenuItem onClick={() => actions.createFolderIn(folderId)}>
        <HugeiconsIcon icon={FolderAddIcon} strokeWidth={2} />
        New folder
      </ContextMenuItem>
    </>
  );
}

function PlusGlyph() {
  return <HugeiconsIcon icon={PlusSignIcon} strokeWidth={2} />;
}
