import { describe, expect, it } from "vitest";
import { markdownToThumbSvg } from "./thumb";

describe("markdownToThumbSvg", () => {
  it("extracts headings and prose while ignoring Mermaid", () => {
    const svg = markdownToThumbSvg(
      "# Architecture\n\nIntro text\n\n```mermaid\ngraph TD; A-->B\n```\n\n- First item",
    );
    expect(svg).toContain("Architecture");
    expect(svg).toContain("Intro text");
    expect(svg).toContain("•  First item");
    expect(svg).not.toContain("graph TD");
  });

  it("escapes user content before inserting it into SVG", () => {
    const svg = markdownToThumbSvg("# <script>& bad");
    expect(svg).not.toContain("<script>");
    expect(svg).toContain("&amp; bad");
  });

  it("returns null for empty or formula-only documents", () => {
    expect(markdownToThumbSvg("  \n")).toBeNull();
    expect(markdownToThumbSvg("$$\nx^2\n$$")).toBeNull();
  });
});
