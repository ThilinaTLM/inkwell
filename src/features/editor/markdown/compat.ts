import type { NotesFileBlob } from "@/lib/api/client";

export function isCanonicalMarkdownBlob(
  blob: Partial<NotesFileBlob>,
): blob is Extract<NotesFileBlob, { format: "markdown-v1" }> {
  return (
    blob.kind === "notes" &&
    "format" in blob &&
    blob.format === "markdown-v1" &&
    "source" in blob &&
    typeof blob.source === "string"
  );
}

/** Convert a legacy BlockNote document without loading its editor UI bundle. */
export async function notesBlobToMarkdown(blob: Partial<NotesFileBlob>): Promise<string> {
  if (isCanonicalMarkdownBlob(blob)) return blob.source;
  if ("blocks" in blob && Array.isArray(blob.blocks)) {
    const { BlockNoteEditor } = await import("@blocknote/core");
    const editor = BlockNoteEditor.create();
    return editor.blocksToMarkdownLossy(blob.blocks as never);
  }
  throw new Error("This Markdown document has an invalid stored format.");
}

export function fingerprintMarkdown(source: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < source.length; i++) {
    hash ^= source.charCodeAt(i);
    hash = (hash + ((hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24))) >>> 0;
  }
  return `${hash.toString(16)}|${source.length}`;
}
