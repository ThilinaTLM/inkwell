/** Preserve uploaded Markdown/text exactly, removing only a UTF-8 BOM. */
export function normalizeMarkdownSource(source: string): string {
  return source.startsWith("\uFEFF") ? source.slice(1) : source;
}
