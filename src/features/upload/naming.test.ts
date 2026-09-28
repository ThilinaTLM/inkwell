import { describe, expect, it } from "vitest";
import { stripExtension, uniqueName } from "./naming";
import { normalizeMarkdownSource } from "./textBlocks";

describe("stripExtension", () => {
  it.each([
    ["architecture-v2.excalidraw", "architecture-v2"],
    ["Retro — sprint 14.md", "Retro — sprint 14"],
    ["net.drawio.xml", "net"],
    ["scene.excalidraw.json", "scene"],
    ["archive.tar.gz", "archive.tar"],
    ["README", "README"],
    [".excalidraw", "Untitled"],
    ["dir/sub/file.txt", "file"],
  ])("%s → %s", (input, out) => {
    expect(stripExtension(input)).toBe(out);
  });
});

describe("uniqueName", () => {
  it("returns the base when free", () => {
    expect(uniqueName("Plan", ["Other"])).toBe("Plan");
  });
  it("appends (2), (3)… case-insensitively", () => {
    expect(uniqueName("Plan", ["plan"])).toBe("Plan (2)");
    expect(uniqueName("Plan", ["Plan", "Plan (2)"])).toBe("Plan (3)");
  });
  it("continues an existing suffix", () => {
    expect(uniqueName("Plan (2)", ["Plan", "Plan (2)"])).toBe("Plan (3)");
  });
  it("keeps names within the length limit", () => {
    const long = "x".repeat(200);
    const out = uniqueName(long, [long]);
    expect(out.length).toBe(200);
    expect(out.endsWith(" (2)")).toBe(true);
  });
});

describe("normalizeMarkdownSource", () => {
  it("preserves Markdown, Mermaid, TeX, Unicode, and line endings exactly", () => {
    const source = "# Héllo\r\n\r\n```mermaid\r\ngraph TD; A-->B\r\n```\r\n\r\n$$x^2$$";
    expect(normalizeMarkdownSource(source)).toBe(source);
  });

  it("removes only a leading UTF-8 BOM", () => {
    expect(normalizeMarkdownSource("\uFEFFa\r\nb")).toBe("a\r\nb");
    expect(normalizeMarkdownSource("a\uFEFFb")).toBe("a\uFEFFb");
  });

  it("preserves empty content", () => {
    expect(normalizeMarkdownSource("")).toBe("");
  });
});
