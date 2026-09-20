// Excalidraw scene → SVG thumbnail string.
//
// Two callers, one output shape so a card's thumbnail looks identical
// whichever path produced it:
//   - `ExcalidrawEditor`'s post-save pipeline, which re-renders after
//     every successful autosave.
//   - The `.excalidraw` import dialog, which renders once right after
//     the file row exists. Without it an imported scene the user never
//     opens would stay a placeholder glyph in the explorer forever.

import { exportToSvg } from "@excalidraw/excalidraw";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type { AppState, BinaryFiles } from "@excalidraw/excalidraw/types";

/**
 * Renders a scene to the SVG stored at `/api/files/:id/thumb`.
 *
 * Width is pinned to 640 with the height left to the viewBox so the
 * card's `object-cover` frame does the cropping.
 */
export async function renderExcalidrawThumbSvg(
  elements: readonly ExcalidrawElement[],
  appState: Partial<AppState>,
  files: BinaryFiles,
): Promise<string> {
  const svg = await exportToSvg({
    elements: normalizeImagesForExport(elements, files),
    appState: {
      ...appState,
      // Transparent export: the dashboard's card body provides the
      // paper, and dark mode applies a CSS invert filter on top of this
      // SVG so dark strokes read as light strokes on the dark card.
      // Baking a white background here would defeat both.
      exportBackground: false,
    } as AppState,
    files,
    exportPadding: 12,
  });
  svg.setAttribute("width", "640");
  svg.removeAttribute("height");
  return svg.outerHTML;
}

// Excalidraw won't render embedded images during export until their
// `status` flips to "saved". Patch a copy before exporting. (Pattern
// borrowed from ExcaliDash.)
function normalizeImagesForExport(
  elements: readonly ExcalidrawElement[],
  files: BinaryFiles,
): ExcalidrawElement[] {
  return elements.map((el) => {
    if (el.type !== "image" || typeof el.fileId !== "string") return el;
    // `file` comes from untrusted JSON on the import path, so every hop is
    // checked at runtime: a missing file or a file without `dataURL` must
    // not throw (this runs inside the caller's best-effort try/catch, so a
    // throw silently costs the thumbnail).
    const dataURL = files[el.fileId]?.dataURL;
    if (typeof dataURL !== "string" || !dataURL.startsWith("data:image/")) return el;
    if (el.status === "saved") return el;
    return { ...el, status: "saved" };
  });
}
