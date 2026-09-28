import { describe, expect, it } from "vitest";
import type { FileBlob } from "../types";
import { isNotesBlob, seedManifestForKind, validateBlobForKind } from "./file-blob";

describe("Markdown file blobs", () => {
  it("seeds new notes-kind files as canonical Markdown", () => {
    expect(seedManifestForKind("notes", "Readme")).toEqual({
      kind: "notes",
      format: "markdown-v1",
      source: "",
    });
  });

  it("accepts canonical Markdown and legacy BlockNote blobs", () => {
    expect(isNotesBlob({ kind: "notes", format: "markdown-v1", source: "# Hi" })).toBe(true);
    expect(isNotesBlob({ kind: "notes", blocks: [] })).toBe(true);
  });

  it("rejects malformed or ambiguous notes blobs", () => {
    for (const value of [
      { kind: "notes", format: "markdown-v1", source: 42 },
      { kind: "notes", format: "markdown-v1", source: "ok", blocks: [] },
      { kind: "notes" },
    ]) {
      expect(validateBlobForKind("notes", value as unknown as FileBlob)).toBeTruthy();
    }
  });
});
