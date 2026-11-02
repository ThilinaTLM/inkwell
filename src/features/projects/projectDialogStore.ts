// Open / close the New project / Edit project dialog from anywhere.
//
//   openProjectDialog()                      – create
//   openProjectDialog({ folderId })          – edit an existing project
// Mounted once via <ProjectDialogHost /> in AppShell.

import { createStore } from "@/lib/store";

export interface ProjectDialogState {
  /** `null` = closed. `folderId: null` = create. */
  open: { folderId: string | null; nonce: number } | null;
}

export const projectDialogStore = createStore<ProjectDialogState>({ open: null });

let nonce = 0;

export function openProjectDialog(opts: { folderId?: string | null } = {}): void {
  projectDialogStore.set({ open: { folderId: opts.folderId ?? null, nonce: ++nonce } });
}

export function closeProjectDialog(): void {
  projectDialogStore.set({ open: null });
}
