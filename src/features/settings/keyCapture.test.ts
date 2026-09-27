import { describe, expect, it } from "vitest";
import { eventToCombo } from "@/lib/commands/keymap";
import { canStartChord, comboToBinding, conflictsFor } from "./keyCapture";

const ev = (
  key: string,
  m: Partial<{ meta: boolean; ctrl: boolean; alt: boolean; shift: boolean }> = {},
) =>
  eventToCombo(
    { key, metaKey: !!m.meta, ctrlKey: !!m.ctrl, altKey: !!m.alt, shiftKey: !!m.shift },
    true,
  );

describe("comboToBinding", () => {
  it("builds canonical bindings from key events (mac)", () => {
    expect(comboToBinding(ev("k", { meta: true, shift: true }))).toBe("mod+shift+k");
    expect(comboToBinding(ev("g"))).toBe("g");
    expect(comboToBinding(ev("F2"))).toBe("f2");
    expect(comboToBinding(ev("?", { shift: true }))).toBe("?");
    expect(comboToBinding(ev("Backspace", { meta: true }))).toBe("mod+backspace");
    expect(comboToBinding(ev("Shift", { shift: true }))).toBeNull();
    expect(comboToBinding(ev("Meta", { meta: true }))).toBeNull();
  });
  it("chord starters", () => {
    expect(canStartChord("g")).toBe(true);
    expect(canStartChord("mod+g")).toBe(false);
    expect(canStartChord("f2")).toBe(false);
  });
});

describe("conflictsFor", () => {
  const eff = {
    "nav.home": ["g h"],
    "item.star": ["s"],
    "item.move": ["m"],
    "app.undo": ["mod+z"],
  };
  it("finds exact and prefix clashes, ignoring itself", () => {
    expect(conflictsFor("item.tags", "s", eff)).toEqual(["item.star"]);
    expect(conflictsFor("item.tags", "g", eff)).toEqual(["nav.home"]);
    expect(conflictsFor("x", "m k", eff)).toEqual(["item.move"]);
    expect(conflictsFor("item.star", "s", eff)).toEqual([]);
    expect(conflictsFor("x", "shift+mod+z", eff)).toEqual([]);
    expect(conflictsFor("x", "mod+z", eff)).toEqual(["app.undo"]);
  });
});
