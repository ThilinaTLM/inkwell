import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import remarkParse from "remark-parse";
import { unified } from "unified";

interface MarkdownNode {
  type?: string;
  value?: string;
  lang?: string | null;
  children?: MarkdownNode[];
}

interface ExtractedLine {
  kind: "heading" | "paragraph" | "list" | "quote";
  text: string;
}

export function markdownToThumbSvg(source: string): string | null {
  const tree = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkMath)
    .parse(source) as MarkdownNode;
  const lines: ExtractedLine[] = [];
  collectLines(tree, lines);
  if (lines.length === 0) return null;

  const heading = lines.find((line) => line.kind === "heading");
  const body = lines.filter((line) => line !== heading).slice(0, 5);
  if (!heading && body.length === 0) return null;

  const width = 640;
  const padX = 36;
  const top = 44;
  const headingSize = 30;
  const bodySize = 18;
  const bodyLineHeight = 28;
  const bodyStart = heading ? top + headingSize + 18 : top;
  const lastBody = bodyStart + Math.max(0, body.length - 1) * bodyLineHeight;
  const height = Math.max(180, lastBody + bodySize + 32);

  const headingSvg = heading
    ? `<text x="${padX}" y="${top}" font-family="ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto" font-size="${headingSize}" font-weight="600" fill="#1f2937" dominant-baseline="hanging">${escapeXml(truncate(heading.text, 80))}</text>`
    : "";
  const bodySvg = body
    .map((line, index) => {
      const prefix = line.kind === "list" ? "•  " : line.kind === "quote" ? "“ " : "";
      const text = prefix + truncate(line.text, 80 - prefix.length);
      return `<text x="${padX}" y="${bodyStart + index * bodyLineHeight}" font-family="ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto" font-size="${bodySize}" fill="#475569" dominant-baseline="hanging">${escapeXml(text)}</text>`;
    })
    .join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}">${headingSvg}${bodySvg}</svg>`;
}

function collectLines(node: MarkdownNode, output: ExtractedLine[]): void {
  if (output.length >= 8) return;
  switch (node.type) {
    case "heading":
      pushLine(output, "heading", textOf(node));
      return;
    case "paragraph":
      pushLine(output, "paragraph", textOf(node));
      return;
    case "blockquote":
      pushLine(output, "quote", textOf(node));
      return;
    case "listItem":
      pushLine(output, "list", textOf(node));
      return;
    case "code":
      if (node.lang?.toLowerCase() !== "mermaid") pushLine(output, "paragraph", node.value ?? "");
      return;
    case "math":
      return;
  }
  for (const child of node.children ?? []) collectLines(child, output);
}

function pushLine(output: ExtractedLine[], kind: ExtractedLine["kind"], raw: string): void {
  const text = raw.replace(/\s+/g, " ").trim();
  if (text) output.push({ kind, text });
}

function textOf(node: MarkdownNode): string {
  if (node.type === "math" || node.type === "inlineMath") return "";
  if (typeof node.value === "string") return node.value;
  return (node.children ?? []).map(textOf).join("");
}

function truncate(value: string, length: number): string {
  return value.length <= length ? value : `${value.slice(0, Math.max(0, length - 1))}…`;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
