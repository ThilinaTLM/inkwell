import { describe, expect, it } from "vitest";
import { parseFolderMeta } from "./folder-meta";

describe("parseFolderMeta", () => {
  it("returns an empty patch when no metadata is sent", () => {
    expect(parseFolderMeta({ name: "x" })).toEqual({});
  });

  it("maps valid fields to columns and keeps explicit nulls", () => {
    expect(
      parseFolderMeta({
        icon: "rocket",
        color: "teal",
        description: "  Notes  ",
        status: "paused",
        pinnedAt: 1700000000000,
      }),
    ).toEqual({
      icon: "rocket",
      color: "teal",
      description: "Notes",
      status: "paused",
      pinned_at: 1700000000000,
    });
    expect(parseFolderMeta({ icon: null, status: null, pinnedAt: null })).toEqual({
      icon: null,
      status: null,
      pinned_at: null,
    });
  });

  it("stores blank descriptions as null", () => {
    expect(parseFolderMeta({ description: "   " })).toEqual({ description: null });
  });

  it("rejects unknown keys, long descriptions and bad pins", () => {
    expect(parseFolderMeta({ icon: "nope" })).toBe("invalid icon");
    expect(parseFolderMeta({ color: "pink" })).toBe("invalid color");
    expect(parseFolderMeta({ status: "archived" })).toBe("invalid status");
    expect(parseFolderMeta({ description: "x".repeat(281) })).toBe("invalid description");
    expect(parseFolderMeta({ pinnedAt: "now" })).toBe("invalid pinnedAt");
  });
});
