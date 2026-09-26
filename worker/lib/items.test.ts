import { describe, expect, it } from "vitest";
import {
  checkFolderMove,
  copyName,
  dedupeByAncestor,
  depthOf,
  type ItemRef,
  locationPath,
  purgeAtFor,
  purgeCutoff,
  TRASH_RETENTION_MS,
} from "./items";

// Tree used throughout:  A ─ B ─ C      D (root)      E ─ F
const parentOf = new Map<string, string | null>([
  ["A", null],
  ["B", "A"],
  ["C", "B"],
  ["D", null],
  ["E", null],
  ["F", "E"],
]);

describe("copyName", () => {
  it("appends (copy) when free", () => {
    expect(copyName("Plan", new Set())).toBe("Plan (copy)");
  });
  it("counts up past taken variants", () => {
    expect(copyName("Plan", new Set(["Plan (copy)"]))).toBe("Plan (copy 2)");
    expect(copyName("Plan", new Set(["Plan (copy)", "Plan (copy 2)"]))).toBe("Plan (copy 3)");
  });
  it("does not stack suffixes when copying a copy", () => {
    expect(copyName("Plan (copy)", new Set(["Plan (copy)"]))).toBe("Plan (copy 2)");
    expect(copyName("Plan (copy 4)", new Set(["Plan (copy)"]))).toBe("Plan (copy 2)");
  });
  it("keeps names within 200 chars", () => {
    const long = "x".repeat(200);
    const out = copyName(long, new Set());
    expect(out.length).toBe(200);
    expect(out.endsWith(" (copy)")).toBe(true);
  });
});

describe("dedupeByAncestor", () => {
  const fileFolder = new Map<string, string | null>([
    ["f1", "C"],
    ["f2", null],
    ["f3", "F"],
  ]);
  it("drops items inside a folder that is also in the batch", () => {
    const refs: ItemRef[] = [
      { type: "folder", id: "A" },
      { type: "folder", id: "C" },
      { type: "file", id: "f1" },
      { type: "file", id: "f2" },
      { type: "file", id: "f3" },
    ];
    expect(dedupeByAncestor(refs, parentOf, fileFolder)).toEqual([
      { type: "folder", id: "A" },
      { type: "file", id: "f2" },
      { type: "file", id: "f3" },
    ]);
  });
  it("removes exact duplicates and keeps order", () => {
    const refs: ItemRef[] = [
      { type: "file", id: "f3" },
      { type: "folder", id: "D" },
      { type: "file", id: "f3" },
    ];
    expect(dedupeByAncestor(refs, parentOf, fileFolder)).toEqual([
      { type: "file", id: "f3" },
      { type: "folder", id: "D" },
    ]);
  });
  it("keeps siblings", () => {
    const refs: ItemRef[] = [
      { type: "folder", id: "B" },
      { type: "folder", id: "F" },
    ];
    expect(dedupeByAncestor(refs, parentOf, fileFolder)).toEqual(refs);
  });
});

describe("checkFolderMove", () => {
  it("rejects moving into itself or a descendant", () => {
    expect(checkFolderMove(parentOf, "A", "A", 8)).toBe("cycle");
    expect(checkFolderMove(parentOf, "A", "C", 8)).toBe("cycle");
  });
  it("allows root and unrelated targets", () => {
    expect(checkFolderMove(parentOf, "B", null, 8)).toBeNull();
    expect(checkFolderMove(parentOf, "B", "D", 8)).toBeNull();
  });
  it("enforces max depth", () => {
    // B's subtree is 2 deep; F sits at depth 2 → 4 total.
    expect(checkFolderMove(parentOf, "B", "F", 3)).toBe("depth");
    expect(checkFolderMove(parentOf, "B", "F", 4)).toBeNull();
    expect(depthOf(parentOf, "C")).toBe(3);
  });
});

describe("trash dates", () => {
  it("purges 30 days after deletion", () => {
    const deletedAt = Date.UTC(2026, 0, 1);
    expect(purgeAtFor(deletedAt)).toBe(Date.UTC(2026, 0, 31));
    expect(TRASH_RETENTION_MS).toBe(30 * 86_400_000);
  });
  it("cutoff selects items deleted at least 30 days ago", () => {
    const nowMs = Date.UTC(2026, 8, 26, 4);
    const cutoff = purgeCutoff(nowMs);
    expect(purgeAtFor(cutoff)).toBe(nowMs);
    expect(Date.UTC(2026, 7, 27, 4) <= cutoff).toBe(true);
    expect(Date.UTC(2026, 7, 28) <= cutoff).toBe(false);
  });
});

describe("locationPath", () => {
  const names = new Map([
    ["A", "Alpha"],
    ["B", "Beta"],
    ["C", "Gamma"],
  ]);
  it("renders Home for the root", () => {
    expect(locationPath(parentOf, names, null)).toBe("Home");
  });
  it("renders the full chain", () => {
    expect(locationPath(parentOf, names, "C")).toBe("Home / Alpha / Beta / Gamma");
  });
});
