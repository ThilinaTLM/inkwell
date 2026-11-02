import { describe, expect, it } from "vitest";
import { fingerprintMarkdown, isCanonicalMarkdownBlob, notesBlobToMarkdown } from "./compat";

describe("markdown compat", () => {
  it("passes canonical markdown through untouched", async () => {
    const source = "# Hi\r\n\r\n*  odd   spacing\n";
    const blob = { kind: "notes", format: "markdown-v1", source } as const;
    expect(isCanonicalMarkdownBlob(blob)).toBe(true);
    expect(await notesBlobToMarkdown(blob)).toBe(source);
  });

  it("rejects unknown stored formats", async () => {
    await expect(notesBlobToMarkdown({ kind: "notes" } as never)).rejects.toThrow();
  });

  it("fingerprints are stable and content-sensitive", () => {
    expect(fingerprintMarkdown("a")).toBe(fingerprintMarkdown("a"));
    expect(fingerprintMarkdown("a")).not.toBe(fingerprintMarkdown("b"));
  });
});
