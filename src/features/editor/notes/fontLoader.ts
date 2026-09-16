// Lazy CSS loader for notes-editor fonts.
//
// Each `@fontsource-variable/<name>/index.css` module is a CSS side-
// effect import that injects `@font-face` declarations into the page.
// We import them dynamically — gated behind the user's font choice —
// so the app shell (router, dashboard, drawio/excalidraw editors) does
// **not** ship 6 variable font CSS bundles to every page load. Vite
// turns each branch of the switch below into its own async chunk; once
// fetched, the result is cached in-memory and the browser's font cache
// keeps subsequent reads off the network.
//
// Inter and JetBrains Mono are intentionally NOT lazy — `src/index.css`
// imports them eagerly because they are the app's UI and mono
// typefaces used by every route (dashboard, dialogs, save status,
// etc.). Calling `loadNotesFont` for either is therefore a no-op.

import type { NotesEditorFont } from "./preferences";

const inflight = new Map<NotesEditorFont, Promise<void>>();
const loaded = new Set<NotesEditorFont>();

export function loadNotesFont(font: NotesEditorFont): Promise<void> {
  if (loaded.has(font)) return Promise.resolve();
  const existing = inflight.get(font);
  if (existing) return existing;

  const task = (async () => {
    switch (font) {
      case "inter":
        // Already shipped eagerly by `src/index.css`; nothing to load.
        break;
      case "manrope":
        await import("@fontsource-variable/manrope/index.css");
        break;
      case "geist":
        await import("@fontsource-variable/geist/index.css");
        break;
      case "lora":
        await import("@fontsource-variable/lora/index.css");
        break;
      case "source-serif":
        await import("@fontsource-variable/source-serif-4/index.css");
        break;
      case "jetbrains-mono":
        // Already shipped eagerly by `src/index.css`; nothing to load.
        break;
    }
    loaded.add(font);
    inflight.delete(font);
  })();

  inflight.set(font, task);
  return task;
}
