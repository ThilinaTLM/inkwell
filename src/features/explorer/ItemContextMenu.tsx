// ItemContextMenu — right-click menu for explorer items.
//
// Renders a `<ContextMenuTrigger>` around its children and a
// `<ContextMenuContent>` populated with the items appropriate for the
// target kind:
//
//   scene  → Open · Open in new tab · Share · Download · Edit tags ·
//            Move to · Rename · Delete
//   folder → Open · Share · New scene inside · New subfolder ·
//            Edit tags · Move to · Rename · Delete
//   empty  → New scene · New folder
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
  Image01Icon,
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
import type { FolderMeta, SceneMeta } from "@/lib/api/client";
import { scenes } from "@/lib/api/client";

export type ItemContextMenuTarget =
  | { kind: "scene"; scene: SceneMeta }
  | { kind: "folder"; folder: FolderMeta }
  | { kind: "empty"; folderId: string | null };

export interface ItemMenuActions {
  openScene: (s: SceneMeta) => void;
  openFolder: (f: FolderMeta) => void;
  shareScene: (s: SceneMeta) => void;
  shareFolder: (f: FolderMeta) => void;
  editSceneTags: (s: SceneMeta) => void;
  editFolderTags: (f: FolderMeta) => void;
  moveScene: (s: SceneMeta) => void;
  moveFolder: (f: FolderMeta) => void;
  renameScene: (s: SceneMeta) => void;
  renameFolder: (f: FolderMeta) => void;
  deleteScene: (s: SceneMeta) => void;
  deleteFolder: (f: FolderMeta) => void;
  createSceneIn: (folderId: string | null) => void;
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
        {target.kind === "scene" ? (
          <SceneItems scene={target.scene} actions={actions} />
        ) : target.kind === "folder" ? (
          <FolderItems folder={target.folder} actions={actions} />
        ) : (
          <EmptyItems folderId={target.folderId} actions={actions} />
        )}
      </ContextMenuContent>
    </ContextMenu>
  );
}

function SceneItems({ scene: s, actions }: { scene: SceneMeta; actions: ItemMenuActions }) {
  return (
    <>
      <ContextMenuItem onClick={() => actions.openScene(s)}>
        <HugeiconsIcon icon={TaskDone01Icon} strokeWidth={2} />
        Open
      </ContextMenuItem>
      <ContextMenuItem onClick={() => window.open(`/s/${s.id}`, "_blank", "noopener")}>
        <HugeiconsIcon icon={Link04Icon} strokeWidth={2} />
        Open in new tab
      </ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem onClick={() => actions.shareScene(s)}>
        <HugeiconsIcon icon={Share08Icon} strokeWidth={2} />
        Share…
      </ContextMenuItem>
      <ContextMenuItem
        render={
          <a href={scenes.downloadUrl(s.id)} download>
            <HugeiconsIcon icon={Download01Icon} strokeWidth={2} />
            Download
          </a>
        }
      />
      <ContextMenuItem onClick={() => actions.editSceneTags(s)}>
        <HugeiconsIcon icon={HashtagIcon} strokeWidth={2} />
        Edit tags…
      </ContextMenuItem>
      <ContextMenuItem onClick={() => actions.moveScene(s)}>
        <HugeiconsIcon icon={FolderAddIcon} strokeWidth={2} />
        Move to…
      </ContextMenuItem>
      <ContextMenuItem onClick={() => actions.renameScene(s)}>
        <HugeiconsIcon icon={Edit02Icon} strokeWidth={2} />
        Rename
      </ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem variant="destructive" onClick={() => actions.deleteScene(s)}>
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
      <ContextMenuItem onClick={() => actions.createSceneIn(f.id)}>
        <HugeiconsIcon icon={Image01Icon} strokeWidth={2} />
        New scene inside
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
      <ContextMenuItem onClick={() => actions.createSceneIn(folderId)}>
        <HugeiconsIcon icon={PlusSignIcon} strokeWidth={2} />
        New scene
      </ContextMenuItem>
      <ContextMenuItem onClick={() => actions.createFolderIn(folderId)}>
        <HugeiconsIcon icon={FolderAddIcon} strokeWidth={2} />
        New folder
      </ContextMenuItem>
    </>
  );
}
