import { describe, expect, it } from "vitest";
import { deletesIn, expiresIn } from "./time";

const NOW = new Date(2026, 10, 3, 15, 0, 0).getTime();
const H = 3_600_000;
const D = 24 * H;

describe("deletesIn", () => {
  it("counts days, hours and flags past-due", () => {
    expect(deletesIn(NOW + 12 * D - H, NOW)).toBe("Deletes in 12 days");
    expect(deletesIn(NOW + 5 * H, NOW)).toBe("Deletes in 5 hours");
    expect(deletesIn(NOW + D, NOW)).toBe("Deletes in 1 day");
    expect(deletesIn(NOW - 1, NOW)).toBe("Deleting soon");
  });
});

describe("expiresIn", () => {
  it("describes never, future and past", () => {
    expect(expiresIn(null, NOW)).toBe("Never expires");
    expect(expiresIn(NOW + 6 * D, NOW)).toBe("Expires in 6 days");
    expect(expiresIn(NOW - 2 * D, NOW)).toMatch(/^Expired \w+/);
  });
});
