// Text → BlockNote document conversion for `.md` / `.txt` uploads.
//
// Markdown goes through BlockNote's own parser (lazy-imported so the
// editor core only loads when a notes file is actually uploaded). Plain
// text, and markdown the parser chokes on, become one paragraph per line.

export interface ParagraphBlock {
  type: "paragraph";
  content: Array<{ type: "text"; text: string; styles: Record<string, never> }>;
}

/** One paragraph per line; runs of blank lines collapse to one empty
 *  paragraph; leading/trailing blank lines are dropped. Always returns
 *  at least one (possibly empty) paragraph — the worker needs a block. */
export function textToParagraphBlocks(text: string): ParagraphBlock[] {
  const lines = text.replace(/^\uFEFF/, "").split(/\r\n?|\n/);
  const blocks: ParagraphBlock[] = [];
  let blank = false;
  for (const raw of lines) {
    const line = raw.replace(/\s+$/, "");
    if (!line) {
      blank = blocks.length > 0;
      continue;
    }
    if (blank) blocks.push({ type: "paragraph", content: [] });
    blank = false;
    blocks.push({ type: "paragraph", content: [{ type: "text", text: line, styles: {} }] });
  }
  if (blocks.length === 0) blocks.push({ type: "paragraph", content: [] });
  return blocks;
}

/** Converts a file's text into notes blocks. `markdown: false` (for
 *  `.txt`) skips the parser. */
export async function textToNoteBlocks(text: string, markdown: boolean): Promise<unknown[]> {
  if (!markdown) return textToParagraphBlocks(text);
  try {
    const { BlockNoteEditor } = await import("@blocknote/core");
    const editor = BlockNoteEditor.create();
    const blocks = editor.tryParseMarkdownToBlocks(text.replace(/^\uFEFF/, ""));
    if (Array.isArray(blocks) && blocks.length > 0) return blocks;
  } catch {
    /* fall through to the plain-text fallback */
  }
  return textToParagraphBlocks(text);
}
