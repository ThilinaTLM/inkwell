import { describe, expect, it } from "vitest";
import { relTime } from "./format";

const NOW = new Date(2026, 10, 3, 15, 0, 0).getTime();
const H = 3_600_000;
const D = 24 * H;

describe("relTime", () => {
  it("handles minutes, hours and yesterday", () => {
    expect(relTime(NOW - 10_000, NOW)).toBe("just now");
    expect(relTime(NOW - 5 * 60_000, NOW)).toBe("5m ago");
    expect(relTime(NOW - 2 * H, NOW)).toBe("2h ago");
    expect(relTime(NOW - 20 * H, NOW)).toBe("yesterday");
  });
  it("uses weekday under a week, then dates", () => {
    const three = new Date(NOW - 3 * D).toLocaleDateString(undefined, { weekday: "long" });
    expect(relTime(NOW - 3 * D, NOW)).toBe(three);
    expect(relTime(new Date(2026, 2, 4).getTime(), NOW)).toMatch(/^Mar 4$/);
    expect(relTime(new Date(2025, 2, 4).getTime(), NOW)).toMatch(/^Mar 4, 2025$/);
  });
});
