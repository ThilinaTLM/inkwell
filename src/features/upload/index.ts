// Public API of the upload feature (WS-D). The shell, explorer and
// empty-state import from here only.

export { collectDrop, dragHasFiles, fileListToEntries } from "./collectDrop";
export { DropOverlay, type DropOverlayProps } from "./DropOverlay";
export {
  type FileDropBindings,
  type FileDropTargetOptions,
  type UploadSummary,
  useFileDropTarget,
  useGlobalFileDrop,
  useUploadSummary,
} from "./hooks";
export { openUploadPicker, type UploadPickerOptions } from "./picker";
export {
  CONFLICT_PREF_KEY,
  cancelAll,
  clearFinished,
  resolveConflict,
  retryJob,
  toggleUploadTray,
  type UploadJob,
  uploadEntries,
  uploadStore,
} from "./queue";
export type { ConflictChoice, DroppedEntry, UploadStage } from "./types";
export { UploadTray } from "./UploadTray";
