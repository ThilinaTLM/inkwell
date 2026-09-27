// Small host-mounted dialogs: new folder, rename, confirm, tags, share.

import { useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { RenameDialog } from "@/components/RenameDialog";
import { useTags } from "@/data/tags";
import { ensureItems, findFolderMeta, resolveItems } from "@/features/actions/itemCache";
import { useItemActions } from "@/features/actions/useItemActions";
import { ShareDialog } from "@/features/sharing/ShareDialog";
import { TagEditDialog } from "@/features/tags/TagEditDialog";
import type { FolderMeta, ItemRef } from "@/lib/api/client";
import type { ConfirmOptions } from "./dialogStore";

/** Delay unmount so the close animation can play. */
function useClosable(onClose: () => void) {
  const [open, setOpen] = useState(true);
  return {
    open,
    onOpenChange: (o: boolean) => {
      if (o) return;
      setOpen(false);
      setTimeout(onClose, 150);
    },
  };
}

export function NewFolderDialog({
  parentId,
  onCreated,
  onClose,
}: {
  parentId: string | null;
  onCreated?: (f: FolderMeta) => void;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const actions = useItemActions();
  const c = useClosable(onClose);
  const where = parentId ? (findFolderMeta(qc, parentId)?.name ?? "folder") : "Home";
  return (
    <RenameDialog
      open={c.open}
      onOpenChange={c.onOpenChange}
      title="New folder"
      description={`Inside ${where}`}
      initialValue=""
      submitLabel="Create"
      allowUnchanged
      onSubmit={async (name) => {
        const f = await actions.createFolder(parentId, name);
        if (f) {
          onCreated?.(f);
          c.onOpenChange(false);
        }
      }}
    />
  );
}

export function RenameItemDialog({ item, onClose }: { item: ItemRef; onClose: () => void }) {
  const qc = useQueryClient();
  const actions = useItemActions();
  const c = useClosable(onClose);
  const [info] = resolveItems(qc, [item]);
  return (
    <RenameDialog
      open={c.open}
      onOpenChange={c.onOpenChange}
      title={item.type === "folder" ? "Rename folder" : "Rename file"}
      initialValue={info.name}
      submitLabel="Rename"
      onSubmit={async (name) => {
        try {
          await actions.rename(item, name);
          c.onOpenChange(false);
        } catch {
          /* toast already shown */
        }
      }}
    />
  );
}

export function HostConfirmDialog({
  opts,
  onClose,
}: {
  opts: ConfirmOptions;
  onClose: () => void;
}) {
  const [open, setOpen] = useState(true);
  const [confirmed, setConfirmed] = useState(false);
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={(o) => {
        if (o) return;
        setOpen(false);
        if (!confirmed) opts.onCancel?.();
        setTimeout(onClose, 150);
      }}
      title={opts.title}
      description={opts.description ?? ""}
      confirmLabel={opts.confirmLabel}
      variant={opts.destructive === false ? "default" : "destructive"}
      onConfirm={async () => {
        setConfirmed(true);
        await opts.onConfirm?.();
        setOpen(false);
        setTimeout(onClose, 150);
      }}
    />
  );
}

export function TagsDialog({ items, onClose }: { items: ItemRef[]; onClose: () => void }) {
  const qc = useQueryClient();
  const actions = useItemActions();
  const tags = useTags();
  const c = useClosable(onClose);
  const infos = resolveItems(qc, items);
  const suggestions = useMemo(() => (tags.data ?? []).map((t) => t.name), [tags.data]);
  // Common tags across all targets seed the picker; saving applies
  // the diff (added / removed) to each item and keeps its other tags.
  const [initial] = useState(() =>
    infos.length ? infos[0].tags.filter((t) => infos.every((i) => i.tags.includes(t))) : [],
  );
  const title =
    infos.length === 1 ? `Tags for "${infos[0].name}"` : `Tags for ${infos.length} items`;
  return (
    <TagEditDialog
      open={c.open}
      onOpenChange={c.onOpenChange}
      initialTags={initial}
      suggestions={suggestions}
      title={title}
      description={
        infos.length > 1
          ? "Shows tags shared by all items. Added tags go on every item; removed tags come off every item."
          : undefined
      }
      onSave={async (draft) => {
        await ensureItems(qc, items);
        const added = draft.filter((t) => !initial.includes(t));
        const removed = initial.filter((t) => !draft.includes(t));
        await actions.setTags(items, (prev) => {
          const kept = prev.filter((t) => !removed.includes(t));
          return [...kept, ...added.filter((t) => !kept.includes(t))];
        });
        return draft;
      }}
    />
  );
}

export function HostShareDialog({ item, onClose }: { item: ItemRef; onClose: () => void }) {
  const qc = useQueryClient();
  const c = useClosable(onClose);
  const [info] = resolveItems(qc, [item]);
  return (
    <ShareDialog
      open={c.open}
      onOpenChange={c.onOpenChange}
      targetType={item.type}
      targetId={item.id}
      targetName={info.name}
      targetKind={info.kind}
    />
  );
}
