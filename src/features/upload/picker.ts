// Hidden file / directory picker. Must be called from a user gesture
// (click, keydown) so the browser lets `input.click()` open the dialog.

import { fileListToEntries } from "./collectDrop";
import { uploadEntries } from "./queue";

export interface UploadPickerOptions {
  folderId: string | null;
  /** Pick a whole directory (`webkitdirectory`). */
  directory?: boolean;
  /** Optional `accept` filter for explicit imports (files only). */
  accept?: string;
}

export function openUploadPicker(opts: UploadPickerOptions): void {
  if (typeof document === "undefined") return;
  const input = document.createElement("input");
  input.type = "file";
  input.multiple = true;
  if (opts.directory) input.setAttribute("webkitdirectory", "");
  else if (opts.accept) input.accept = opts.accept;
  input.style.display = "none";
  input.setAttribute("aria-hidden", "true");

  const cleanup = () => input.remove();
  input.addEventListener("change", () => {
    const entries = fileListToEntries(input.files);
    cleanup();
    uploadEntries(entries, opts.folderId);
  });
  input.addEventListener("cancel", cleanup);
  document.body.appendChild(input);
  input.click();
}
