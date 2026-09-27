import { describe, expect, it } from "vitest";
import { lruSet, stepThumbSize, viewKeyFor } from "./explorerPrefs";

describe("lruSet", () => {
  it("appends new keys as most recent", () => {
    expect(lruSet([["a", 1]], "b", 2, 5)).toEqual([
      ["a", 1],
      ["b", 2],
    ]);
  });
  it("moves an existing key to the end with the new value", () => {
    expect(
      lruSet(
        [
          ["a", 1],
          ["b", 2],
          ["c", 3],
        ],
        "a",
        9,
        5,
      ),
    ).toEqual([
      ["b", 2],
      ["c", 3],
      ["a", 9],
    ]);
  });
  it("evicts the least recently used entries beyond max", () => {
    let e: Array<[string, number]> = [];
    for (let i = 0; i < 205; i++) e = lruSet(e, `f${i}`, i, 200);
    expect(e).toHaveLength(200);
    expect(e[0][0]).toBe("f5");
    expect(e[199][0]).toBe("f204");
  });
  it("does not mutate the input", () => {
    const input: Array<[string, number]> = [["a", 1]];
    lruSet(input, "b", 2, 1);
    expect(input).toEqual([["a", 1]]);
  });
});

describe("helpers", () => {
  it("steps thumbnail sizes within bounds", () => {
    expect(stepThumbSize("m", 1)).toBe("l");
    expect(stepThumbSize("xl", 1)).toBe("xl");
    expect(stepThumbSize("s", -1)).toBe("s");
  });
  it("derives view keys", () => {
    expect(viewKeyFor({ currentFolderId: null, route: "/" })).toBeNull();
    expect(viewKeyFor({ currentFolderId: "abc", route: "/folders/abc" })).toBe("abc");
    expect(viewKeyFor({ currentFolderId: undefined, route: "/recent" })).toBe("route:/recent");
  });
});
