import { describe, expect, it } from "vitest";
import {
  EMPTY_SEL,
  type NavLayout,
  nextIndex,
  selectionReducer as r,
  rangeKeys,
} from "./selection-logic";

const order = ["a", "b", "c", "d", "e", "f"];

describe("selectionReducer", () => {
  it("plain click replaces the selection and sets the anchor", () => {
    const s = r(
      { selected: ["a", "b"], anchor: "a", focus: "b" },
      { type: "click", key: "d", order },
    );
    expect(s).toEqual({ selected: ["d"], anchor: "d", focus: "d" });
  });

  it("mod-click toggles", () => {
    let s = r(EMPTY_SEL, { type: "click", key: "a", order });
    s = r(s, { type: "click", key: "c", mod: true, order });
    expect(s.selected).toEqual(["a", "c"]);
    s = r(s, { type: "click", key: "a", mod: true, order });
    expect(s.selected).toEqual(["c"]);
    expect(s.anchor).toBe("a");
  });

  it("shift-click selects a range from the anchor (both directions)", () => {
    let s = r(EMPTY_SEL, { type: "click", key: "c", order });
    s = r(s, { type: "click", key: "e", shift: true, order });
    expect(s.selected).toEqual(["c", "d", "e"]);
    s = r(s, { type: "click", key: "a", shift: true, order });
    expect(s.selected).toEqual(["a", "b", "c"]);
    expect(s.anchor).toBe("c");
  });

  it("mod+shift-click adds the range", () => {
    let s = r(EMPTY_SEL, { type: "click", key: "a", order });
    s = r(s, { type: "click", key: "d", mod: true, order });
    s = r(s, { type: "click", key: "f", mod: true, shift: true, order });
    expect(s.selected.sort()).toEqual(["a", "d", "e", "f"]);
  });

  it("shift+arrow extends from the anchor", () => {
    let s = r(EMPTY_SEL, { type: "focus", key: "b", order });
    s = r(s, { type: "focus", key: "c", shift: true, order });
    s = r(s, { type: "focus", key: "d", shift: true, order });
    expect(s.selected).toEqual(["b", "c", "d"]);
    s = r(s, { type: "focus", key: "a", shift: true, order });
    expect(s.selected).toEqual(["a", "b"]);
  });

  it("mod+arrow only moves focus", () => {
    const s = r(
      { selected: ["a"], anchor: "a", focus: "a" },
      { type: "focus", key: "c", mod: true, order },
    );
    expect(s).toEqual({ selected: ["a"], anchor: "a", focus: "c" });
  });

  it("selectAll / clear / set / prune", () => {
    let s = r(EMPTY_SEL, { type: "selectAll", order });
    expect(s.selected).toEqual(order);
    s = r(s, { type: "clear" });
    expect(s.selected).toEqual([]);
    s = r(s, { type: "set", keys: ["b", "b", "c"] });
    expect(s).toEqual({ selected: ["b", "c"], anchor: "b", focus: "b" });
    s = r(s, { type: "prune", order: ["c", "d"] });
    expect(s).toEqual({ selected: ["c"], anchor: null, focus: null });
    expect(r(s, { type: "prune", order: ["c"] })).toBe(s);
  });

  it("marquee modes", () => {
    const base = ["a", "b"];
    expect(
      r(EMPTY_SEL, { type: "marquee", hits: ["b", "c"], base, mode: "replace" }).selected,
    ).toEqual(["b", "c"]);
    expect(r(EMPTY_SEL, { type: "marquee", hits: ["b", "c"], base, mode: "add" }).selected).toEqual(
      ["a", "b", "c"],
    );
    expect(
      r(EMPTY_SEL, { type: "marquee", hits: ["b", "c"], base, mode: "toggle" }).selected,
    ).toEqual(["a", "c"]);
  });

  it("rangeKeys tolerates a missing anchor", () => {
    expect(rangeKeys(order, "zz", "b")).toEqual(["b"]);
  });
});

describe("nextIndex", () => {
  const list: NavLayout = { type: "list" };
  it("list: up/down clamp, left/right no-op, home/end", () => {
    expect(nextIndex(0, "up", list, 5)).toBe(0);
    expect(nextIndex(4, "down", list, 5)).toBe(4);
    expect(nextIndex(2, "left", list, 5)).toBe(2);
    expect(nextIndex(2, "end", list, 5)).toBe(4);
    expect(nextIndex(-1, "down", list, 5)).toBe(0);
    expect(nextIndex(3, "pageUp", list, 50, 10)).toBe(0);
  });

  it("flow (compact column flow)", () => {
    const flow: NavLayout = { type: "flow", rows: 4 };
    expect(nextIndex(1, "down", flow, 10)).toBe(2);
    expect(nextIndex(1, "right", flow, 10)).toBe(5);
    expect(nextIndex(9, "right", flow, 10)).toBe(9);
    expect(nextIndex(7, "right", flow, 10)).toBe(9);
    expect(nextIndex(5, "left", flow, 10)).toBe(1);
    expect(nextIndex(2, "left", flow, 10)).toBe(0);
  });

  it("grid with sections", () => {
    // 5 folders in 4 cols, 6 files in 4 cols
    const g: NavLayout = {
      type: "grid",
      sections: [
        { start: 0, count: 5, cols: 4 },
        { start: 5, count: 6, cols: 4 },
      ],
    };
    expect(nextIndex(1, "down", g, 11)).toBe(4); // row 2 has only index 4
    expect(nextIndex(4, "down", g, 11)).toBe(5); // into files section, col 0
    expect(nextIndex(2, "right", g, 11)).toBe(3);
    expect(nextIndex(3, "down", g, 11)).toBe(4); // clamps to last folder
    expect(nextIndex(6, "up", g, 11)).toBe(4); // up from files col 1 → folders last row (col clamped)
    expect(nextIndex(9, "up", g, 11)).toBe(5);
    expect(nextIndex(10, "down", g, 11)).toBe(10);
    expect(nextIndex(6, "down", g, 11)).toBe(10); // shorter last row → last item
    expect(nextIndex(0, "up", g, 11)).toBe(0);
  });
});
