import { describe, expect, it } from "vitest";
import { stripExtension, uniqueName } from "./naming";
import { textToParagraphBlocks } from "./textBlocks";

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

describe("textToParagraphBlocks", () => {
  it("creates one paragraph per line and collapses blank runs", () => {
    const blocks = textToParagraphBlocks("\n\nOne\nTwo\n\n\n\nThree\n\n");
    expect(blocks.map((b) => b.content.map((c) => c.text).join(""))).toEqual([
      "One",
      "Two",
      "",
      "Three",
    ]);
  });
  it("handles CRLF and BOM", () => {
    const blocks = textToParagraphBlocks("\uFEFFa\r\nb");
    expect(blocks.map((b) => b.content[0]?.text)).toEqual(["a", "b"]);
  });
  it("returns an empty paragraph for empty text", () => {
    expect(textToParagraphBlocks("")).toEqual([{ type: "paragraph", content: [] }]);
  });
});
