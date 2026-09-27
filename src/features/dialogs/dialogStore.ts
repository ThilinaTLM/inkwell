// Dialog stack store (no React import needed by callers).
//
// PUBLIC CONTRACT
//   interface DialogPropsMap {
//     newFile:   { folderId: string | null; kind?: FileKind }
//     newFolder: { parentId: string | null; onCreated?: (f: FolderMeta) => void }
//     move:      { items: ItemRef[] }
//     rename:    { item: ItemRef }
//     tags:      { items: ItemRef[] }
//     share:     { item: ItemRef }
//     confirm:   ConfirmOptions
//   }
//   type DialogName = keyof DialogPropsMap
//   openDialog(name, props): number   – pushes onto the stack, returns an id
//   closeDialog(id?)                  – closes `id`, or the top-most dialog
//   confirmDialog(opts): Promise<boolean>
//   dialogStore / useDialogStack()
//
// `useDialogs()` (in DialogHost.tsx) wraps these for components.

import type { ReactNode } from "react";
import type { FileKind, FolderMeta, ItemRef } from "@/lib/api/client";
import { createStore, useStore } from "@/lib/store";

export interface ConfirmOptions {
  title: ReactNode;
  description?: ReactNode;
  confirmLabel?: string;
  /** Destructive (red) styling. Default true. */
  destructive?: boolean;
  onConfirm?: () => void | Promise<void>;
  onCancel?: () => void;
}

export interface DialogPropsMap {
  newFile: { folderId: string | null; kind?: FileKind };
  newFolder: { parentId: string | null; onCreated?: (f: FolderMeta) => void };
  move: { items: ItemRef[] };
  rename: { item: ItemRef };
  tags: { items: ItemRef[] };
  share: { item: ItemRef };
  confirm: ConfirmOptions;
}

export type DialogName = keyof DialogPropsMap;

export type DialogEntry = {
  [K in DialogName]: { id: number; name: K; props: DialogPropsMap[K] };
}[DialogName];

export const dialogStore = createStore<DialogEntry[]>([]);
let seq = 0;

export function openDialog<K extends DialogName>(name: K, props: DialogPropsMap[K]): number {
  const id = ++seq;
  dialogStore.set((s) => [...s, { id, name, props } as DialogEntry]);
  return id;
}

export function closeDialog(id?: number): void {
  dialogStore.set((s) => {
    if (!s.length) return s;
    if (id === undefined) return s.slice(0, -1);
    return s.filter((d) => d.id !== id);
  });
}

export function confirmDialog(
  opts: Omit<ConfirmOptions, "onConfirm" | "onCancel">,
): Promise<boolean> {
  return new Promise((resolve) => {
    openDialog("confirm", {
      ...opts,
      onConfirm: () => resolve(true),
      onCancel: () => resolve(false),
    });
  });
}

export function useDialogStack(): DialogEntry[] {
  return useStore(dialogStore);
}
