import { describe, expect, it } from "vitest";
import {
  comboMatches,
  createChordMatcher,
  eventToCombo,
  findConflicts,
  formatBinding,
  isSingleKeyBinding,
  type KeyEventLike,
  normalizeBinding,
  parseBinding,
} from "./keymap";

function ev(key: string, mods: Partial<KeyEventLike> = {}): KeyEventLike {
  return { key, metaKey: false, ctrlKey: false, altKey: false, shiftKey: false, ...mods };
}

describe("parseBinding", () => {
  it("parses modifiers and keys", () => {
    expect(parseBinding("mod+shift+c")).toEqual([
      { key: "c", mod: true, shift: true, alt: false, ctrl: false },
    ]);
    expect(parseBinding("F2")[0].key).toBe("f2");
    expect(parseBinding("esc")[0].key).toBe("escape");
    expect(parseBinding("mod+\\")[0]).toMatchObject({ key: "\\", mod: true });
    expect(parseBinding("mod++")[0]).toMatchObject({ key: "+", mod: true });
  });
  it("parses chords", () => {
    const c = parseBinding("g h");
    expect(c).toHaveLength(2);
    expect(c.map((x) => x.key)).toEqual(["g", "h"]);
  });
  it("normalizes order and aliases", () => {
    expect(normalizeBinding("shift+cmd+C")).toBe("mod+shift+c");
    expect(normalizeBinding("G  H")).toBe("g h");
  });
});

describe("eventToCombo / comboMatches", () => {
  const match = (binding: string, e: KeyEventLike, mac: boolean) =>
    comboMatches(parseBinding(binding)[0], eventToCombo(e, mac));

  it("maps mod to meta on mac and ctrl elsewhere", () => {
    expect(match("mod+k", ev("k", { metaKey: true }), true)).toBe(true);
    expect(match("mod+k", ev("k", { ctrlKey: true }), true)).toBe(false);
    expect(match("mod+k", ev("k", { ctrlKey: true }), false)).toBe(true);
    expect(match("mod+k", ev("k", { metaKey: true }), false)).toBe(false);
  });
  it("requires exact shift for letters", () => {
    expect(match("s", ev("s"), true)).toBe(true);
    expect(match("s", ev("S", { shiftKey: true }), true)).toBe(false);
    expect(match("shift+s", ev("S", { shiftKey: true }), true)).toBe(true);
    expect(match("mod+shift+c", ev("C", { metaKey: true, shiftKey: true }), true)).toBe(true);
  });
  it("treats shifted punctuation leniently", () => {
    expect(match("?", ev("?", { shiftKey: true }), false)).toBe(true);
    expect(match("mod+=", ev("+", { ctrlKey: true, shiftKey: true }), false)).toBe(true);
    expect(match("mod+=", ev("=", { ctrlKey: true }), false)).toBe(true);
    expect(match("mod+-", ev("-", { ctrlKey: true }), false)).toBe(true);
  });
  it("uses the physical key when alt is held", () => {
    expect(match("alt+n", { ...ev("˜", { altKey: true }), code: "KeyN" }, true)).toBe(true);
  });
  it("handles named keys", () => {
    expect(match("delete", ev("Delete"), true)).toBe(true);
    expect(match("mod+backspace", ev("Backspace", { metaKey: true }), true)).toBe(true);
    expect(match("space", ev(" "), true)).toBe(true);
    expect(match("f2", ev("F2"), true)).toBe(true);
    expect(match("mod+enter", ev("Enter", { ctrlKey: true }), false)).toBe(true);
    expect(match("enter", ev("Enter", { ctrlKey: true }), false)).toBe(false);
  });
});

describe("createChordMatcher", () => {
  const bindings = [
    { id: "go.home", combos: parseBinding("g h") },
    { id: "go.recent", combos: parseBinding("g r") },
    { id: "star", combos: parseBinding("s") },
    { id: "palette", combos: parseBinding("mod+k") },
  ];
  const combo = (key: string, mods: Partial<KeyEventLike> = {}) =>
    eventToCombo(ev(key, mods), true);

  it("matches single keys immediately", () => {
    const m = createChordMatcher();
    expect(m.feed(bindings, combo("s"), 0)).toEqual({ type: "match", id: "star" });
    expect(m.feed(bindings, combo("k", { metaKey: true }), 0)).toEqual({
      type: "match",
      id: "palette",
    });
  });
  it("matches 2-key chords", () => {
    const m = createChordMatcher();
    expect(m.feed(bindings, combo("g"), 0)).toEqual({ type: "pending" });
    expect(m.feed(bindings, combo("r"), 100)).toEqual({ type: "match", id: "go.recent" });
  });
  it("ignores modifier-only presses while pending", () => {
    const m = createChordMatcher();
    m.feed(bindings, combo("g"), 0);
    expect(m.feed(bindings, combo("Shift", { shiftKey: true }), 10).type).toBe("pending");
    expect(m.feed(bindings, combo("h"), 20)).toEqual({ type: "match", id: "go.home" });
  });
  it("times out and treats the next key fresh", () => {
    const m = createChordMatcher(1000);
    m.feed(bindings, combo("g"), 0);
    expect(m.feed(bindings, combo("s"), 5000)).toEqual({ type: "match", id: "star" });
  });
  it("falls through to single keys after an unmatched chord step", () => {
    const m = createChordMatcher();
    m.feed(bindings, combo("g"), 0);
    expect(m.feed(bindings, combo("s"), 10)).toEqual({ type: "match", id: "star" });
    expect(m.isPending).toBe(false);
  });
  it("returns none for unbound keys", () => {
    const m = createChordMatcher();
    expect(m.feed(bindings, combo("x"), 0)).toEqual({ type: "none" });
  });
});

describe("helpers", () => {
  it("classifies single-key bindings", () => {
    expect(isSingleKeyBinding("s")).toBe(true);
    expect(isSingleKeyBinding("shift+n")).toBe(true);
    expect(isSingleKeyBinding("g h")).toBe(true);
    expect(isSingleKeyBinding("mod+k")).toBe(false);
    expect(isSingleKeyBinding("f2")).toBe(false);
    expect(isSingleKeyBinding("delete")).toBe(false);
  });
  it("formats per platform", () => {
    expect(formatBinding("mod+shift+c", true)).toBe("⇧⌘C");
    expect(formatBinding("mod+shift+c", false)).toBe("Ctrl+Shift+C");
    expect(formatBinding("g h", true)).toBe("G H");
    expect(formatBinding("mod+backspace", true)).toBe("⌘⌫");
    expect(formatBinding("f2", false)).toBe("F2");
  });
  it("finds conflicts", () => {
    const c = findConflicts({ a: ["mod+k"], b: ["cmd+K"], c: ["g"], d: ["g h"], e: ["x"] });
    expect(c).toContainEqual({ binding: "mod+k", ids: ["a", "b"] });
    expect(c).toContainEqual({ binding: "g", ids: ["c", "d"] });
    expect(c.find((x) => x.binding === "x")).toBeUndefined();
  });
});
