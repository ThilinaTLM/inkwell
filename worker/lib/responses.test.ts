import { describe, expect, it } from "vitest";
import { isActiveMime, safeMime } from "./responses";

describe("safeMime", () => {
  it("normalizes well-formed types and drops parameters", () => {
    expect(safeMime("Text/HTML; charset=utf-8")).toBe("text/html");
    expect(
      safeMime("application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
    ).toBe("application/vnd.openxmlformats-officedocument.wordprocessingml.document");
  });
  it("falls back for junk", () => {
    expect(safeMime(null)).toBe("application/octet-stream");
    expect(safeMime("")).toBe("application/octet-stream");
    expect(safeMime("text/html\r\nx-evil: 1")).toBe("application/octet-stream");
    expect(safeMime("nonsense")).toBe("application/octet-stream");
  });
});

describe("isActiveMime", () => {
  it("flags content a browser can execute", () => {
    for (const m of ["text/html", "image/svg+xml", "application/xhtml+xml", "text/xml"]) {
      expect(isActiveMime(m)).toBe(true);
    }
    for (const m of ["application/pdf", "image/png", "text/plain", "video/mp4"]) {
      expect(isActiveMime(m)).toBe(false);
    }
  });
});
