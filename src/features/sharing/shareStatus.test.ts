import { describe, expect, it } from "vitest";
import type { Share } from "@/lib/api/client";
import {
  DEFAULT_SHARE_FILTERS,
  expiryLabel,
  extendExpiry,
  filterShares,
  groupByTarget,
  presetToExpiresAt,
  shareStatus,
  shortExpiry,
} from "./shareStatus";

const H = 3_600_000;
const D = 24 * H;
const NOW = new Date(2026, 8, 24, 12, 0).getTime();

function share(p: Partial<Share>): Share {
  return {
    token: p.token ?? Math.random().toString(36).slice(2),
    targetType: "file",
    targetId: "f1",
    targetName: "System overview",
    permission: "read",
    allowDownload: true,
    label: null,
    createdAt: NOW - D,
    expiresAt: null,
    lastAccessedAt: null,
    ...p,
  };
}

describe("shareStatus", () => {
  it("classifies never / active / expiring (<24h) / expired", () => {
    expect(shareStatus({ expiresAt: null }, NOW)).toBe("active");
    expect(shareStatus({ expiresAt: NOW + 6 * D }, NOW)).toBe("active");
    expect(shareStatus({ expiresAt: NOW + D }, NOW)).toBe("active");
    expect(shareStatus({ expiresAt: NOW + D - 1 }, NOW)).toBe("expiring");
    expect(shareStatus({ expiresAt: NOW + 2 * H }, NOW)).toBe("expiring");
    expect(shareStatus({ expiresAt: NOW }, NOW)).toBe("expired");
    expect(shareStatus({ expiresAt: NOW - D }, NOW)).toBe("expired");
  });
});

describe("filterShares", () => {
  const list = [
    share({ token: "a", label: "Client review", expiresAt: NOW + 6 * D }),
    share({ token: "b", permission: "write", label: "Team edit" }),
    share({
      token: "c",
      targetType: "folder",
      targetId: "d1",
      targetName: "Sprint boards",
      expiresAt: NOW + 2 * H,
    }),
    share({ token: "d", targetName: "Auth flow", expiresAt: NOW - 12 * D }),
  ];
  const tokens = (xs: Share[]) => xs.map((s) => s.token);

  it("defaults to active (includes expiring, hides expired)", () => {
    expect(tokens(filterShares(list, DEFAULT_SHARE_FILTERS, NOW))).toEqual(["a", "b", "c"]);
  });
  it("status chips", () => {
    const f = DEFAULT_SHARE_FILTERS;
    expect(tokens(filterShares(list, { ...f, status: "expiring" }, NOW))).toEqual(["c"]);
    expect(tokens(filterShares(list, { ...f, status: "expired" }, NOW))).toEqual(["d"]);
    expect(filterShares(list, { ...f, status: "all" }, NOW)).toHaveLength(4);
  });
  it("type, access and search", () => {
    const f = { ...DEFAULT_SHARE_FILTERS, status: "all" as const };
    expect(tokens(filterShares(list, { ...f, type: "folder" }, NOW))).toEqual(["c"]);
    expect(tokens(filterShares(list, { ...f, access: "write" }, NOW))).toEqual(["b"]);
    expect(tokens(filterShares(list, { ...f, q: "sprint" }, NOW))).toEqual(["c"]);
    expect(tokens(filterShares(list, { ...f, q: "REVIEW" }, NOW))).toEqual(["a"]);
  });
  it("groups by target in first-seen order", () => {
    const g = groupByTarget(list);
    expect(g.map((x) => x.key)).toEqual(["file:f1", "folder:d1"]);
    expect(g[0].rows).toHaveLength(3);
  });
});

describe("expiry helpers", () => {
  it("labels", () => {
    expect(expiryLabel(null, NOW)).toBe("Never");
    expect(expiryLabel(NOW + 2 * H, NOW)).toBe("in 2 hours");
    expect(expiryLabel(NOW + 6 * D, NOW)).toBe("in 6 days");
    expect(expiryLabel(NOW + D, NOW)).toBe("in 1 day");
    expect(expiryLabel(new Date(2026, 8, 12).getTime(), NOW)).toBe("Expired Sep 12");
    expect(shortExpiry(null, NOW)).toBe("∞");
    expect(shortExpiry(NOW + 6 * D, NOW)).toBe("6 d");
    expect(shortExpiry(NOW + 3 * H, NOW)).toBe("3 h");
    expect(shortExpiry(NOW - 1, NOW)).toBe("expired");
  });
  it("presets and extend", () => {
    expect(presetToExpiresAt("7d", NOW)).toBe(NOW + 7 * D);
    expect(presetToExpiresAt("never", NOW)).toBeNull();
    expect(extendExpiry(null, D, NOW)).toBeNull();
    expect(extendExpiry(NOW + H, D, NOW)).toBe(NOW + H + D);
    expect(extendExpiry(NOW - 5 * D, D, NOW)).toBe(NOW + D);
  });
});
