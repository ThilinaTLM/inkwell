// Single mount point for app-wide dialogs (mounted once in AppShell).
//
// PUBLIC CONTRACT
//   <DialogHost />
//   useDialogs(): {
//     open<K extends DialogName>(name: K, props: DialogPropsMap[K]): number;
//     close(id?: number): void;
//     confirm(opts): Promise<boolean>;
//   }
//   Non-hook equivalents: openDialog / closeDialog / confirmDialog (./dialogStore)
//
//   Names → props (see dialogStore.ts):
//     "newFile"   { folderId, kind? }        quick kind picker (screen 09)
//     "newFolder" { parentId, onCreated? }
//     "move"      { items: ItemRef[] }       screen 13
//     "rename"    { item: ItemRef }
//     "tags"      { items: ItemRef[] }       multi = add/remove common tags
//     "share"     { item: ItemRef }          existing ShareDialog
//     "confirm"   { title, description?, confirmLabel?, destructive?, onConfirm?, onCancel? }

import { useMemo } from "react";
import {
  closeDialog,
  confirmDialog,
  type DialogEntry,
  openDialog,
  useDialogStack,
} from "./dialogStore";
import { MoveDialog } from "./MoveDialog";
import { NewFileDialog } from "./NewFileDialog";
import {
  HostConfirmDialog,
  HostShareDialog,
  NewFolderDialog,
  RenameItemDialog,
  TagsDialog,
} from "./SimpleDialogs";

export type { ConfirmOptions, DialogName, DialogPropsMap } from "./dialogStore";
export { closeDialog, confirmDialog, openDialog } from "./dialogStore";

export function useDialogs() {
  return useMemo(() => ({ open: openDialog, close: closeDialog, confirm: confirmDialog }), []);
}

export function DialogHost() {
  const stack = useDialogStack();
  return (
    <>
      {stack.map((d) => (
        <HostedDialog key={d.id} entry={d} />
      ))}
    </>
  );
}

function HostedDialog({ entry }: { entry: DialogEntry }) {
  const onClose = () => closeDialog(entry.id);
  switch (entry.name) {
    case "newFile":
      return <NewFileDialog {...entry.props} onClose={onClose} />;
    case "newFolder":
      return <NewFolderDialog {...entry.props} onClose={onClose} />;
    case "move":
      return <MoveDialog items={entry.props.items} onClose={onClose} />;
    case "rename":
      return <RenameItemDialog item={entry.props.item} onClose={onClose} />;
    case "tags":
      return <TagsDialog items={entry.props.items} onClose={onClose} />;
    case "share":
      return <HostShareDialog item={entry.props.item} onClose={onClose} />;
    case "confirm":
      return <HostConfirmDialog opts={entry.props} onClose={onClose} />;
    default:
      return null;
  }
}
