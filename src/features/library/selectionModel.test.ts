import { describe, expect, it } from "vitest";
import {
  clickSelect,
  EMPTY_SEL,
  jumpFocus,
  moveFocus,
  pruneSel,
  selectAllKeys,
  toggleKey,
} from "./selectionModel";

const ORDER = ["a", "b", "c", "d", "e"];

describe("selectionModel", () => {
  it("plain click selects one and sets the anchor", () => {
    const s = clickSelect(EMPTY_SEL, ORDER, "c");
    expect(s).toEqual({ selected: ["c"], anchor: "c", focus: "c" });
  });

  it("toggle click adds and removes", () => {
    let s = clickSelect(EMPTY_SEL, ORDER, "a");
    s = clickSelect(s, ORDER, "c", { toggle: true });
    expect(s.selected).toEqual(["a", "c"]);
    s = clickSelect(s, ORDER, "a", { toggle: true });
    expect(s.selected).toEqual(["c"]);
  });

  it("range click spans from the anchor in either direction", () => {
    let s = clickSelect(EMPTY_SEL, ORDER, "d");
    s = clickSelect(s, ORDER, "b", { range: true });
    expect(s.selected).toEqual(["b", "c", "d"]);
    expect(s.anchor).toBe("d");
    s = clickSelect(s, ORDER, "e", { range: true });
    expect(s.selected).toEqual(["d", "e"]);
  });

  it("range + toggle unions with the existing selection", () => {
    let s = clickSelect(EMPTY_SEL, ORDER, "a");
    s = clickSelect(s, ORDER, "d", { toggle: true });
    s = clickSelect(s, ORDER, "e", { toggle: true, range: true });
    expect(s.selected.sort()).toEqual(["a", "d", "e"]);
  });

  it("arrow keys move focus and shift extends", () => {
    let s = moveFocus(EMPTY_SEL, ORDER, 1, false);
    expect(s.focus).toBe("a");
    s = moveFocus(s, ORDER, 1, true);
    s = moveFocus(s, ORDER, 1, true);
    expect(s.selected).toEqual(["a", "b", "c"]);
    s = moveFocus(s, ORDER, -10, false);
    expect(s).toEqual({ selected: ["a"], anchor: "a", focus: "a" });
    s = jumpFocus(s, ORDER, "end", true);
    expect(s.selected).toEqual(ORDER);
  });

  it("toggleKey, selectAll and prune", () => {
    const s = toggleKey(selectAllKeys(ORDER), "b");
    expect(s.selected).toEqual(["a", "c", "d", "e"]);
    const p = pruneSel(s, ["a", "b"]);
    expect(p.selected).toEqual(["a"]);
    expect(p.focus).toBe("b");
    expect(pruneSel(p, ["a", "b"])).toBe(p);
  });
});
