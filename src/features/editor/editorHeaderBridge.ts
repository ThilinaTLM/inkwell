// Bridge between an editor's save lifecycle and the page-level
// `<EditorHeader>`.
//
// Each editor (Excalidraw, draw.io, Notes) owns its own
// `useSaveLifecycle` + `useLeaveConfirm` instance, because the
// lifecycle closes over editor-specific snapshot refs. The header,
// however, is built by the page (owner `EditorPage` or visitor
// `SharedEditorPage`) because it needs page-level state (rename,
// share dialog, starred, folder path). Editors therefore accept a
// `renderHeader(bridge)` prop and call it with this bridge, so the
// page can render the header with live save state and route every
// navigation (back, breadcrumb, duplicate, trash) through the
// editor's leave-confirm guard.

import type { ReactNode } from "react";
import type { EditorSaveStatus } from "./lifecycle/types";

export interface EditorMenuExtra {
  id: string;
  label: string;
  icon?: ReactNode;
  onSelect: () => void;
}

export interface EditorHeaderBridge {
  /** `null` when the editor has no save lifecycle (static sites) or
   *  the session is read-only. `"loading"` while the editor is still
   *  booting (draw.io iframe before `init`). */
  status: EditorSaveStatus | "loading" | null;
  errorMessage: string | null;
  /** Force an immediate save. `null` on read-only sessions. */
  saveNow: (() => void) | null;
  /** Persist pending edits and resolve `true` when the server is in
   *  sync (used before duplicate / download / trash). */
  flush: () => Promise<boolean>;
  /** Drop pending local edits (used by the conflict banner's reload). */
  discard: () => void;
  /** Run `cont` now if clean, otherwise after the leave-confirm dialog. */
  requestLeave: (cont: () => void) => void;
  /** Editor-specific entries for the header's ⋯ menu. */
  menuExtras?: EditorMenuExtra[];
  /** Editor-specific controls rendered in the header's right cluster
   *  (Notes view toggles, static-site "Open"). */
  toolbar?: ReactNode;
}

export type RenderEditorHeader = (bridge: EditorHeaderBridge) => ReactNode;

/** Bridge for editors without a save lifecycle (static sites). */
export function staticBridge(
  extra: Pick<EditorHeaderBridge, "menuExtras" | "toolbar"> = {},
): EditorHeaderBridge {
  return {
    status: null,
    errorMessage: null,
    saveNow: null,
    flush: async () => true,
    discard: () => {},
    requestLeave: (cont) => cont(),
    ...extra,
  };
}
