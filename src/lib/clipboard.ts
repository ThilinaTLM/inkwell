// Clipboard helper: silent best-effort write, never throws.

/**
 * Writes text to the system clipboard. Returns `true` on success, `false`
 * if the browser denied permission or the API is unavailable. Callers are
 * expected to surface their own toast/feedback.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
