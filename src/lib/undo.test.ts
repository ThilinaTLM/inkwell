import { describe, expect, it } from "vitest";
import { createUndoStack } from "./undo";

const noop = async () => {};

describe("createUndoStack", () => {
  it("pops newest first", () => {
    const s = createUndoStack(20);
    s.push({ label: "a", undo: noop });
    s.push({ label: "b", undo: noop });
    expect(s.pop()?.label).toBe("b");
    expect(s.pop()?.label).toBe("a");
    expect(s.pop()).toBeUndefined();
  });
  it("caps the stack at the limit, dropping the oldest", () => {
    const s = createUndoStack(3);
    for (const l of ["1", "2", "3", "4", "5"]) s.push({ label: l, undo: noop });
    expect(s.size()).toBe(3);
    expect(s.store.get().map((e) => e.label)).toEqual(["3", "4", "5"]);
  });
  it("takes a specific entry by id", () => {
    const s = createUndoStack(20);
    const a = s.push({ label: "a", undo: noop });
    s.push({ label: "b", undo: noop });
    expect(s.take(a)?.label).toBe("a");
    expect(s.take(a)).toBeUndefined();
    expect(s.store.get().map((e) => e.label)).toEqual(["b"]);
  });
});
