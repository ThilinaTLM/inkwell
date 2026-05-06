// Inject Inkwell-specific entries (Tags, Share, Download .drawio) at
// the bottom of drawio's native File menu.
//
// Mechanism: drawio's `Menus` keeps a registry `editorUi.menus.menus`
// keyed by menu name; each entry is a `Menu` whose `funct(popup,
// parent)` is invoked when the menu opens (drawio's top-level
// menubar bypasses `Menus.prototype.addMenu` and the
// `addPluginMenuItems` hook \u2014 that hook only fires for *sub-menus*).
// We wrap the file menu's `funct` once, calling the original first
// then appending a separator + our items via the standard
// `popupMenu.addSeparator(parent)` / `popupMenu.addItem(label, image,
// fn, parent)` API.
//
// Same-origin iframe access. The live `editorUi` (an `App` instance
// extending `EditorUi`) is exposed on `iframe.contentWindow.editorUi`
// by `public/drawio-bootstrap.js`, which monkey-patches
// `App.prototype.init` from inside the iframe. We MUST be called
// after drawio's `init` postMessage has fired \u2014 that's the signal
// that `App.prototype.init` has run, so `editorUi` is ready.
//
// Idempotent: re-installing on the same EditorUi instance hot-swaps
// the handler refs without re-wrapping `funct` (which would compose
// our wrapper twice and add duplicate items).
//
// Resets for free on theme/style flip: the iframe remounts with a
// fresh contentWindow, fresh App instance, fresh menu registry.

import type { LoadedFile } from "@/lib/api/client";

export interface FileMenuExtraHandlers {
  /** Open the Tags dialog. Omit to hide the entry (e.g. shared editor). */
  onTags?: () => void;
  /** Open the Share dialog. Omit to hide the entry. */
  onShare?: () => void;
  /** Trigger a .drawio download. Omit to hide the entry. */
  onDownload?: () => void;
  /** The currently-loaded file. Drives read-only / allowDownload gating. */
  loaded: LoadedFile;
}

interface DrawioPopupMenu {
  addItem: (
    label: string,
    image: unknown,
    funct: () => void,
    parent: unknown,
    sprite?: unknown,
    enabled?: boolean,
  ) => unknown;
  addSeparator: (parent: unknown) => void;
}

interface DrawioMenu {
  funct: (popup: DrawioPopupMenu, parent: unknown) => void;
  __inkwellOriginalFunct?: (popup: DrawioPopupMenu, parent: unknown) => void;
}

interface DrawioGlobals {
  editorUi?: {
    menus: {
      menus: Record<string, DrawioMenu | undefined>;
    };
    /** Stash for the live handler ref so re-installs hot-swap rather than re-wrap. */
    __inkwellExtras?: {
      handlers: FileMenuExtraHandlers;
    };
  };
}

/**
 * Install (or update) the File-menu extras on the given iframe's
 * EditorUi. Returns a disposer that restores the original `funct`,
 * fully unhooking our items.
 *
 * Safe to call before `editorUi` is exposed \u2014 returns a no-op
 * disposer in that case. Caller should re-invoke once the `init`
 * postMessage arrives.
 */
export function installFileMenuExtras(
  iframe: HTMLIFrameElement,
  handlers: FileMenuExtraHandlers,
): () => void {
  const w = iframe.contentWindow as unknown as DrawioGlobals | null;
  const editorUi = w?.editorUi;
  if (!editorUi) return () => {};

  const fileMenu = editorUi.menus.menus.file;
  if (!fileMenu) return () => {};

  // Hot-swap handlers on a re-install: the live `funct` closure
  // reads from `__inkwellExtras.handlers`, so updating that ref is
  // the entire surface of a re-install.
  if (editorUi.__inkwellExtras) {
    editorUi.__inkwellExtras.handlers = handlers;
    return () => unwrapFileMenu(editorUi, fileMenu);
  }

  const ref: { handlers: FileMenuExtraHandlers } = { handlers };
  editorUi.__inkwellExtras = ref;

  const original = fileMenu.funct;
  fileMenu.__inkwellOriginalFunct = original;

  fileMenu.funct = (popup, parent) => {
    // Always run drawio's own File-menu builder first so its native
    // entries appear unchanged.
    original.call(fileMenu, popup, parent);

    const h = ref.handlers;
    const writable = h.loaded.permission === "write";
    const allowDownload = h.loaded.allowDownload;

    const showTags = !!h.onTags && writable;
    const showShare = !!h.onShare && writable;
    const showDownload = !!h.onDownload && allowDownload;

    if (!showTags && !showShare && !showDownload) return;

    popup.addSeparator(parent);
    if (showTags) {
      popup.addItem("Tags\u2026", null, () => h.onTags?.(), parent);
    }
    if (showShare) {
      popup.addItem("Share\u2026", null, () => h.onShare?.(), parent);
    }
    if (showDownload) {
      popup.addItem("Download .drawio", null, () => h.onDownload?.(), parent);
    }
  };

  return () => unwrapFileMenu(editorUi, fileMenu);
}

function unwrapFileMenu(editorUi: NonNullable<DrawioGlobals["editorUi"]>, fileMenu: DrawioMenu) {
  if (fileMenu.__inkwellOriginalFunct) {
    fileMenu.funct = fileMenu.__inkwellOriginalFunct;
    fileMenu.__inkwellOriginalFunct = undefined;
  }
  editorUi.__inkwellExtras = undefined;
}
