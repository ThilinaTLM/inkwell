// Shared project actions as menu items (dropdown ⋯ menus and context menus).

import {
  Copy01Icon,
  Delete02Icon,
  Download01Icon,
  Edit02Icon,
  FolderOpenIcon,
  Pen01Icon,
  PinIcon,
  PinOffIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import { Fragment, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { ContextMenuItem, ContextMenuSeparator } from "@/components/ui/context-menu";
import { DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { usePinProject } from "@/data/home";
import { itemActions } from "@/features/actions/useItemActions";
import type { FolderMeta } from "@/lib/api/client";
import { openProjectDialog } from "./projectDialogStore";

interface Entry {
  id: string;
  label: string;
  icon: IconSvgElement;
  run: () => void;
  destructive?: boolean;
  /** Draw a separator above this entry. */
  sep?: boolean;
}

/** Pin or unpin mutation as a plain function (for buttons outside menus). */
export function useTogglePin() {
  const pin = usePinProject();
  return (folder: Pick<FolderMeta, "id" | "pinnedAt">) =>
    pin.mutate({ id: folder.id, pinned: folder.pinnedAt === null });
}

export function ProjectMenuItems({
  folder,
  as,
  includeOpen = false,
  extra,
}: {
  folder: FolderMeta;
  as: "dropdown" | "context";
  includeOpen?: boolean;
  /** Extra leading item(s), rendered before "Edit project". */
  extra?: ReactNode;
}) {
  const navigate = useNavigate();
  const togglePin = useTogglePin();
  const ref = { type: "folder", id: folder.id } as const;
  const pinned = folder.pinnedAt !== null;
  const entries: Entry[] = [
    ...(includeOpen
      ? [
          {
            id: "open",
            label: "Open",
            icon: FolderOpenIcon,
            run: () => navigate(`/folders/${folder.id}`),
          },
        ]
      : []),
    {
      id: "edit",
      label: "Edit project",
      icon: Pen01Icon,
      run: () => openProjectDialog({ folderId: folder.id }),
      sep: includeOpen,
    },
    {
      id: "pin",
      label: pinned ? "Unpin from Home" : "Pin to Home",
      icon: pinned ? PinOffIcon : PinIcon,
      run: () => togglePin(folder),
    },
    { id: "rename", label: "Rename", icon: Edit02Icon, run: () => itemActions.renameDialog(ref) },
    {
      id: "duplicate",
      label: "Duplicate",
      icon: Copy01Icon,
      run: () => void itemActions.duplicate([ref]),
    },
    {
      id: "zip",
      label: "Download as zip",
      icon: Download01Icon,
      run: () => void itemActions.download([ref]),
    },
    {
      id: "trash",
      label: "Move to Trash",
      icon: Delete02Icon,
      run: () => void itemActions.trash([ref]),
      destructive: true,
      sep: true,
    },
  ];
  const Item = as === "dropdown" ? DropdownMenuItem : ContextMenuItem;
  const Sep = as === "dropdown" ? DropdownMenuSeparator : ContextMenuSeparator;
  return (
    <>
      {extra}
      {entries.map((e) => (
        <Fragment key={e.id}>
          {e.sep ? <Sep /> : null}
          <Item variant={e.destructive ? "destructive" : undefined} onClick={() => e.run()}>
            <HugeiconsIcon icon={e.icon} strokeWidth={1.8} />
            {e.label}
          </Item>
        </Fragment>
      ))}
    </>
  );
}
