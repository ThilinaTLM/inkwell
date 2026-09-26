// `.excalidraw` pre-flight, moved from `ImportExcalidrawDialog`.
//
// The worker (`normalizeImportedExcalidraw`) stays authoritative; this
// mirrors its acceptance rules so a bad file is refused before upload,
// and hands back the parsed scene for the thumbnail and for "Replace",
// which PUTs the normalised scene into an existing file.

export interface ExcalidrawScene {
  elements: unknown[];
  appState: Record<string, unknown>;
  files: Record<string, unknown>;
}

/** Parse + validate an excalidraw export. Returns the scene or an
 *  error message. */
export function parseExcalidrawScene(text: string): ExcalidrawScene | string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return "Not valid JSON";
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return "No Excalidraw scene in this file";
  }
  const raw = parsed as Record<string, unknown>;
  // `type` is absent from Inkwell's own downloads, so only a present and
  // conflicting value is a rejection.
  if (raw.type !== undefined && raw.type !== "excalidraw")
    return "No Excalidraw scene in this file";
  if (!Array.isArray(raw.elements)) return "No elements array";
  // A `null` element crashes the editor; refuse non-objects up front.
  if (raw.elements.some((el) => typeof el !== "object" || el === null)) {
    return "Contains invalid elements";
  }
  if (raw.appState !== undefined && (typeof raw.appState !== "object" || raw.appState === null)) {
    return "Invalid appState";
  }
  if (raw.files !== undefined && (typeof raw.files !== "object" || raw.files === null)) {
    return "Invalid files";
  }
  return {
    elements: raw.elements,
    appState: (raw.appState as Record<string, unknown> | undefined) ?? {},
    files: (raw.files as Record<string, unknown> | undefined) ?? {},
  };
}

/** Stored blob shape for a Replace PUT — same normalisation the worker
 *  applies on import: drop `theme`, pin `appState.name` to the row name. */
export function sceneToStoredBlob(scene: ExcalidrawScene, name: string) {
  const { theme: _theme, ...appState } = scene.appState;
  return {
    elements: scene.elements,
    appState: { ...appState, name },
    files: scene.files,
  };
}

/** Best-effort SVG thumbnail (lazy-loads Excalidraw's exporter). */
export async function renderSceneThumb(scene: ExcalidrawScene): Promise<string | null> {
  if (scene.elements.length === 0) return null;
  const { renderExcalidrawThumbSvg } = await import("@/features/editor/excalidrawThumb");
  type Args = Parameters<typeof renderExcalidrawThumbSvg>;
  return renderExcalidrawThumbSvg(
    scene.elements as unknown as Args[0],
    scene.appState as Args[1],
    scene.files as unknown as Args[2],
  );
}

/** SHA-256 hex of the bytes, or `null` outside a secure context. */
export async function sha256Hex(buf: ArrayBuffer): Promise<string | null> {
  if (typeof crypto === "undefined" || !crypto.subtle) return null;
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, "0")).join("");
}
