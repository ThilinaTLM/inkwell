import { describe, expect, it } from "vitest";
import {
  fmtBytes,
  fmtShortDate,
  groupRecent,
  purgeCountdown,
  purgeIsSoon,
  recentGroupOf,
} from "./helpers";

const H = 3_600_000;
const D = 24 * H;
// Thursday 2026-09-24 15:30 local time.
const NOW = new Date(2026, 8, 24, 15, 30).getTime();

describe("recentGroupOf", () => {
  it("classifies by local calendar day and Monday-based week", () => {
    expect(recentGroupOf(NOW - H, NOW)).toBe("Today");
    expect(recentGroupOf(new Date(2026, 8, 24, 0, 1).getTime(), NOW)).toBe("Today");
    expect(recentGroupOf(new Date(2026, 8, 23, 23, 59).getTime(), NOW)).toBe("Yesterday");
    expect(recentGroupOf(new Date(2026, 8, 23, 0, 0).getTime(), NOW)).toBe("Yesterday");
    expect(recentGroupOf(new Date(2026, 8, 21, 9, 0).getTime(), NOW)).toBe("This week"); // Monday
    expect(recentGroupOf(new Date(2026, 8, 20, 9, 0).getTime(), NOW)).toBe("Earlier"); // Sunday
  });

  it("puts yesterday before 'this week' on a Monday", () => {
    const monday = new Date(2026, 8, 21, 10, 0).getTime();
    expect(recentGroupOf(new Date(2026, 8, 20, 10, 0).getTime(), monday)).toBe("Yesterday");
    expect(recentGroupOf(new Date(2026, 8, 19, 10, 0).getTime(), monday)).toBe("Earlier");
  });
});

describe("groupRecent", () => {
  it("keeps order, drops empty groups", () => {
    const items = [NOW - H, NOW - 2 * H, NOW - 40 * D, NOW - D];
    const g = groupRecent(items, (x) => x, NOW);
    expect(g.map((x) => x.label)).toEqual(["Today", "Yesterday", "Earlier"]);
    expect(g[0].items).toEqual([NOW - H, NOW - 2 * H]);
  });
});

describe("purgeCountdown", () => {
  it("formats days, hours and edge cases", () => {
    expect(purgeCountdown(NOW + 30 * D, NOW)).toBe("30 d");
    expect(purgeCountdown(NOW + 29 * D + H, NOW)).toBe("30 d");
    expect(purgeCountdown(NOW + 7 * D, NOW)).toBe("7 d");
    expect(purgeCountdown(NOW + 5 * H, NOW)).toBe("5 h");
    expect(purgeCountdown(NOW + 20 * 60_000, NOW)).toBe("< 1 h");
    expect(purgeCountdown(NOW - 1, NOW)).toBe("soon");
  });
  it("flags the last three days", () => {
    expect(purgeIsSoon(NOW + 2 * D, NOW)).toBe(true);
    expect(purgeIsSoon(NOW + 10 * D, NOW)).toBe(false);
  });
});

describe("fmtShortDate", () => {
  it("uses relative day names, then month/day, then year", () => {
    expect(fmtShortDate(new Date(2026, 8, 24, 8, 10).getTime(), NOW)).toBe("Today, 08:10");
    expect(fmtShortDate(new Date(2026, 8, 23, 17, 2).getTime(), NOW)).toBe("Yesterday, 17:02");
    expect(fmtShortDate(new Date(2026, 8, 3, 12, 0).getTime(), NOW)).toBe("Sep 03");
    expect(fmtShortDate(new Date(2025, 11, 31, 12, 0).getTime(), NOW)).toBe("Dec 31, 2025");
  });
});

describe("fmtBytes", () => {
  it("scales units", () => {
    expect(fmtBytes(0)).toBe("0 B");
    expect(fmtBytes(512)).toBe("512 B");
    expect(fmtBytes(1536)).toBe("1.5 KB");
    expect(fmtBytes(212 * 1024 * 1024)).toBe("212 MB");
  });
});
