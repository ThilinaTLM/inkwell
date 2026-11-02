// Small helpers shared by the per-kind exporters: filename hygiene and
// the Blob → "Save as" download.

/** Strip characters that are illegal in filenames and any known editor extension. */
export function exportBaseName(name: string): string {
  const cleaned = name
    .replace(/\.(excalidraw|drawio|md|markdown|txt|html?|zip|png|svg|pdf)$/i, "")
    .replace(/[\\/:*?"<>|]+/g, "_")
    .trim();
  return cleaned || "untitled";
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Give the browser a tick to start the download before revoking.
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function downloadText(text: string, filename: string, mime: string): void {
  downloadBlob(new Blob([text], { type: `${mime};charset=utf-8` }), filename);
}

/** `data:` URL (base64 or percent-encoded) → Blob. */
export function dataUrlToBlob(dataUrl: string): Blob {
  const comma = dataUrl.indexOf(",");
  const meta = dataUrl.slice(5, comma);
  const payload = dataUrl.slice(comma + 1);
  const mime = meta.split(";")[0] || "application/octet-stream";
  if (/;base64/i.test(meta)) {
    const bin = atob(payload);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Blob([bytes], { type: mime });
  }
  return new Blob([decodeURIComponent(payload)], { type: mime });
}
