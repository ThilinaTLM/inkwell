// Pure helpers for the Excalidraw editor: the dirty-check fingerprint
// and the persisted-appState picker. Kept separate so they can be unit
// tested without mounting Excalidraw.

import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type { AppState, BinaryFiles } from "@excalidraw/excalidraw/types";

// Cheap O(n) fingerprint of the meaningful scene state — used to dedup
// autosaves so cursor/selection/zoom/pan ticks don't trigger network I/O.
//
// Element-side signal: Excalidraw bumps `element.version` on any real
// mutation (create, move, resize, text edit, style, z-order, delete) and
// leaves it alone for transient UI state. So a rolling hash of per-element
// versions captures "did the document change" without serialising element
// bodies.
//
// AppState-side signal: a whitelist of persisted-relevant fields. Covers
// (a) document settings (background, grid, theme, name, zen/snap modes)
// and (b) the `currentItem*` style memory — colors / fonts / stroke /
// arrowheads / roundness — because changing those is a real user action
// that doesn't bump any element version. Anything not on this list
// (cursor coords, selection, zoom, scrollX/Y, active tool, hover state,
// editing flags, etc.) is intentionally ignored.
//
// File-side signal: sorted file-key list (catches added/removed images;
// content edits to an existing image change the fileId, hence the key).
export function fingerprintScene(
  elements: readonly ExcalidrawElement[],
  appState: Partial<AppState>,
  files: BinaryFiles,
): string {
  let elemHash = elements.length | 0;
  for (let i = 0; i < elements.length; i++) {
    const v = ((elements[i] as { version?: number }).version ?? 0) | 0;
    elemHash = (elemHash * 31 + v) | 0;
  }
  const a = appState as Partial<AppState> & Record<string, unknown>;
  const appPart = [
    a.viewBackgroundColor ?? "",
    a.gridModeEnabled ? 1 : 0,
    a.gridSize ?? "",
    // Theme is an app-level preference (see src/lib/theme.tsx) and is
    // controlled via Excalidraw's `theme` prop, so it's intentionally
    // not part of the dirty fingerprint and is stripped from the
    // persisted blob in pickPersistableAppState. The scene `name` is
    // likewise excluded: it mirrors the file name (renamed through the
    // PATCH endpoint, synced into Excalidraw by an effect), so a stale
    // stored value must not make an untouched file look edited.
    a.zenModeEnabled ? 1 : 0,
    a.objectsSnapModeEnabled ? 1 : 0,
    // Current-item style memory — user-chosen defaults for the next shape.
    a.currentItemStrokeColor ?? "",
    a.currentItemBackgroundColor ?? "",
    a.currentItemFillStyle ?? "",
    a.currentItemStrokeWidth ?? "",
    a.currentItemStrokeStyle ?? "",
    a.currentItemRoughness ?? "",
    a.currentItemOpacity ?? "",
    a.currentItemFontFamily ?? "",
    a.currentItemFontSize ?? "",
    a.currentItemTextAlign ?? "",
    a.currentItemStartArrowhead ?? "",
    a.currentItemEndArrowhead ?? "",
    a.currentItemRoundness ?? "",
    a.currentItemArrowType ?? "",
  ].join("|");
  const fileKeys = Object.keys(files);
  const filePart = fileKeys.length === 0 ? "" : fileKeys.sort().join(",");
  return `${elemHash}|${appPart}|${filePart}`;
}

// Strip transient appState that isn't meaningful to persist.
export function pickPersistableAppState(
  appState: AppState,
  fallbackName: string,
): Record<string, unknown> {
  const {
    collaborators: _c,
    cursorButton: _cb,
    isLoading: _il,
    errorMessage: _em,
    draggingElement: _de,
    editingElement: _ee,
    selectionElement: _se,
    multiElement: _me,
    suggestedBindings: _sb,
    pendingImageElementId: _pi,
    contextMenu: _cm,
    showHyperlinkPopup: _hp,
    snapLines: _sl,
    originSnapOffset: _osn,
    // Theme is owned app-side now; don't persist it on the blob.
    theme: _t,
    ...rest
  } = appState as unknown as Record<string, unknown>;
  return { ...rest, name: (rest.name as string | undefined) || fallbackName };
}
