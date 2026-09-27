import { describe, expect, it } from "vitest";
import { fuzzyFilter, fuzzyMatch, highlightSegments } from "./fuzzy";

function score(q: string, t: string): number {
  const r = fuzzyMatch(q, t);
  if (!r) throw new Error(`expected "${q}" to match "${t}"`);
  return r.score;
}

describe("fuzzyMatch", () => {
  it("returns null when chars are missing or out of order", () => {
    expect(fuzzyMatch("xyz", "Auth flow")).toBeNull();
    expect(fuzzyMatch("wa", "aw")).toBeNull();
  });
  it("matches subsequences and reports positions", () => {
    const r = fuzzyMatch("afl", "Auth flow");
    expect(r).not.toBeNull();
    expect(r?.positions).toEqual([0, 5, 6]);
  });
  it("ranks exact > prefix > word-start > substring > scattered", () => {
    const exact = score("auth", "auth");
    const prefix = score("auth", "Auth flow");
    const word = score("auth", "OAuth sequence / auth");
    const sub = score("uth", "OAuth");
    const scattered = score("atf", "Auth flow");
    expect(exact).toBeGreaterThan(prefix);
    expect(prefix).toBeGreaterThan(word);
    expect(word).toBeGreaterThan(sub);
    expect(sub).toBeGreaterThan(scattered);
  });
  it("prefers word starts in scattered matches", () => {
    const a = score("gh", "Go home");
    const b = score("gh", "aligh");
    expect(a).toBeGreaterThan(b);
  });
  it("empty query matches with zero score", () => {
    expect(fuzzyMatch("  ", "anything")).toEqual({ score: 0, positions: [] });
  });
});

describe("fuzzyFilter", () => {
  it("sorts by score and keeps stable order for ties", () => {
    const items = ["Move to…", "Remove tags", "Open", "move files"];
    const out = fuzzyFilter("move", items, (x) => x).map((r) => r.item);
    expect(out[0]).toBe("Move to…");
    expect(out).toContain("Remove tags");
    expect(out).not.toContain("Open");
  });
  it("respects the limit", () => {
    expect(fuzzyFilter("", ["a", "b", "c"], (x) => x, 2)).toHaveLength(2);
  });
});

describe("highlightSegments", () => {
  it("splits text into matched runs", () => {
    expect(highlightSegments("Auth", [0, 1])).toEqual([
      { text: "Au", match: true },
      { text: "th", match: false },
    ]);
  });
});
