// Notes thumbnail generator.
//
// Notes files have no canvas, so the existing thumbnail pipeline
// (client-side SVG → R2) is fed a synthesised "page card" SVG instead:
// a few lines of plain text extracted from the BlockNote document,
// styled as a sketch-paper card so it slots in next to Excalidraw and
// drawio thumbnails on the dashboard.
//
// Why SVG instead of a separate D1 `summary` column:
//   - keeps `has_thumb`/`thumb_updated_at`/R2-key shape uniform across
//     all kinds (no migration, no fork in `<FileCard>`);
//   - the dashboard already ships an immutable 1-year cache header and
//     a `?v=<bust>` token, so re-rendering on every save is cheap;
//   - dark mode reuses the existing `.ink-thumb-img` invert filter.
//
// Anything not in the small set of "text-bearing" block types (paragraph,
// heading, list items, quote, code) is ignored — embedded images, file
// blocks, and tables don't contribute to the preview text. If the doc is
// effectively empty we return `null`, matching the Excalidraw editor's
// empty-canvas guard.

/** Block shape we care about — minimal duck-typed view of BlockNote's
 *  document JSON. We never inspect any field BlockNote owns
 *  exclusively; this stays compatible across BlockNote minor bumps. */
interface ThumbBlock {
  type?: string;
  content?: unknown;
  children?: unknown;
}

/** Generate a thumbnail SVG for a notes document, or `null` if the
 *  document is empty (no text content anywhere). */
export function notesBlocksToThumbSvg(blocks: unknown[]): string | null {
  const lines = extractLines(blocks);
  if (lines.length === 0) return null;

  // Take at most 1 leading heading-ish line + 5 body lines. A single
  // heading collapses to (heading, []) which still produces a card
  // — that's intentional, headings carry meaning even alone.
  const heading = lines.find((l) => l.kind === "heading");
  const body = lines.filter((l) => l !== heading).slice(0, 5);
  if (!heading && body.length === 0) return null;

  // Layout constants — tuned to roughly match the visual density of
  // the Excalidraw export (640 wide, ~auto height) so the cards look
  // like siblings on the dashboard grid.
  const W = 640;
  const PAD_X = 36;
  const PAD_Y_TOP = 44;
  const HEADING_SIZE = 30;
  const HEADING_GAP = 18;
  const BODY_SIZE = 18;
  const BODY_LINE_HEIGHT = 28;
  const BODY_MAX_CHARS = 80;

  const headingY = PAD_Y_TOP;
  const bodyStartY = heading ? headingY + HEADING_SIZE + HEADING_GAP : PAD_Y_TOP;
  const lastBodyY = bodyStartY + Math.max(0, body.length - 1) * BODY_LINE_HEIGHT;
  // Pad bottom by half a line so the last line doesn't kiss the edge.
  const H = Math.max(180, lastBodyY + BODY_SIZE + 32);

  // We use neutral grayscale colors so the dashboard's dark-mode
  // `.ink-thumb-img` `filter: invert(1) hue-rotate(180deg)` produces a
  // sensible contrast inversion (light text on dark in dark mode).
  const INK = "#1f2937"; // slate-800
  const MUTED = "#475569"; // slate-600

  const headingTspan = heading
    ? `<text x="${PAD_X}" y="${headingY}" font-family="ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto" font-size="${HEADING_SIZE}" font-weight="600" fill="${INK}" dominant-baseline="hanging">${escapeXml(truncate(heading.text, BODY_MAX_CHARS))}</text>`
    : "";

  const bodyTspans = body
    .map((line, i) => {
      const y = bodyStartY + i * BODY_LINE_HEIGHT;
      const prefix = line.kind === "list" ? "•  " : line.kind === "quote" ? "“ " : "";
      const text = `${prefix}${truncate(line.text, BODY_MAX_CHARS - prefix.length)}`;
      return `<text x="${PAD_X}" y="${y}" font-family="ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto" font-size="${BODY_SIZE}" fill="${MUTED}" dominant-baseline="hanging">${escapeXml(text)}</text>`;
    })
    .join("");

  // Transparent background so the FileCard's own paper texture shows
  // through — same approach as Excalidraw's `exportBackground: false`.
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}">${headingTspan}${bodyTspans}</svg>`;
}

interface ExtractedLine {
  kind: "heading" | "paragraph" | "list" | "quote";
  text: string;
}

function extractLines(blocks: unknown[]): ExtractedLine[] {
  const out: ExtractedLine[] = [];
  walk(blocks, out);
  return out;
}

function walk(nodes: unknown, out: ExtractedLine[]): void {
  if (!Array.isArray(nodes)) return;
  for (const raw of nodes) {
    if (!raw || typeof raw !== "object") continue;
    const block = raw as ThumbBlock;
    const text = inlineText(block.content).trim();
    if (text) {
      const kind = mapKind(block.type);
      if (kind) out.push({ kind, text });
    }
    // Recurse into nested blocks (BlockNote nests via `children`).
    if (block.children) walk(block.children, out);
    // Stop early once we have enough — cheap upper bound.
    if (out.length >= 8) return;
  }
}

function mapKind(type: unknown): ExtractedLine["kind"] | null {
  switch (type) {
    case "heading":
      return "heading";
    case "paragraph":
    case "codeBlock":
      return "paragraph";
    case "bulletListItem":
    case "numberedListItem":
    case "checkListItem":
      return "list";
    case "quote":
      return "quote";
    default:
      return null;
  }
}

/** Flatten a BlockNote inline-content array (or a plain string) to
 *  plain text. Anything we don't recognise is treated as empty. */
function inlineText(content: unknown): string {
  if (!content) return "";
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  let s = "";
  for (const part of content) {
    if (!part) continue;
    if (typeof part === "string") {
      s += part;
      continue;
    }
    if (typeof part === "object") {
      const p = part as { type?: string; text?: unknown };
      if (typeof p.text === "string") s += p.text;
      // Other inline node types (link, mention, etc.) carry their
      // visible text in `content` recursively.
      const nested = (part as { content?: unknown }).content;
      if (nested) s += inlineText(nested);
    }
  }
  return s;
}

function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  return `${s.slice(0, Math.max(0, n - 1))}…`;
}

/** XML-escape text content — non-negotiable since the document text is
 *  user-supplied and gets dropped into a `<text>` element verbatim. */
function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
