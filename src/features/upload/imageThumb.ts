// Client-side thumbnails for uploaded images.
//
// `PUT /api/files/:id/thumb` stores whatever it receives as
// `image/svg+xml`, so a raster preview is wrapped in a tiny SVG
// (`<image href="data:…">`) after downscaling through a canvas.

const MAX_EDGE = 480;
// The worker rejects thumbs over 1 MB; stay well below.
const MAX_SVG_BYTES = 700 * 1024;

export function isThumbnailableImage(file: Blob): boolean {
  return /^image\/(png|jpe?g|webp|gif|avif|bmp|svg\+xml)$/i.test(file.type);
}

function loadImage(blob: Blob): Promise<{ img: HTMLImageElement; revoke: () => void }> {
  const url = URL.createObjectURL(blob);
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ img, revoke: () => URL.revokeObjectURL(url) });
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not decode the image"));
    };
    img.src = url;
  });
}

/** Downscaled preview of an image as an SVG string, or `null` when it can't be produced. */
export async function imageToThumbSvg(blob: Blob): Promise<string | null> {
  if (!isThumbnailableImage(blob) || typeof document === "undefined") return null;
  const { img, revoke } = await loadImage(blob);
  try {
    const sw = img.naturalWidth || 300;
    const sh = img.naturalHeight || 200;
    const scale = Math.min(1, MAX_EDGE / Math.max(sw, sh));
    const w = Math.max(1, Math.round(sw * scale));
    const h = Math.max(1, Math.round(sh * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, w, h);
    for (const quality of [0.82, 0.6, 0.4]) {
      // WebP keeps transparency and is small; fall back to PNG where unsupported.
      let dataUrl = canvas.toDataURL("image/webp", quality);
      if (!dataUrl.startsWith("data:image/webp")) dataUrl = canvas.toDataURL("image/png");
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}"><image href="${dataUrl}" width="${w}" height="${h}"/></svg>`;
      if (svg.length <= MAX_SVG_BYTES) return svg;
    }
    return null;
  } finally {
    revoke();
  }
}
