import { openDialog } from "@/features/dialogs/dialogStore";

/** Folder id when the current URL is a folder page, else `null` (Inbox). */
export function currentFolderFromLocation(): string | null {
  if (typeof location === "undefined") return null;
  const m = /^\/folders\/([^/?#]+)/.exec(location.pathname);
  return m ? decodeURIComponent(m[1]) : null;
}

/** Open the global capture dialog. Target defaults to the folder page being
 *  viewed (else the Inbox); pass `folderId` to override (`null` = Inbox). */
export function openCapture(opts: { folderId?: string | null } = {}): void {
  openDialog("newFile", {
    folderId: opts.folderId === undefined ? currentFolderFromLocation() : opts.folderId,
  });
}
