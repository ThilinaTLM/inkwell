// Pure share-link classification, filtering and expiry helpers used by
// the Shared links page, the ShareDialog and the link details panel.
//
// PUBLIC CONTRACT
//   EXPIRING_SOON_MS = 24 h
//   type ShareStatus = "active" | "expiring" | "expired"
//   shareStatus(share, now): ShareStatus         – expiring = expires within 24 h
//   type StatusFilter = "all" | "active" | "expiring" | "expired"
//       ("active" = not expired, i.e. includes expiring links)
//   interface ShareFilters { type: "all"|"file"|"folder"; access: "all"|"read"|"write";
//                            status: StatusFilter; q: string }
//   filterShares(shares, filters, now): Share[]
//   groupByTarget(shares): { key, targetType, targetId, name, rows }[]   – first-seen order
//   expiryLabel(expiresAt, now): string          – "Never" · "in 2 hours" · "in 6 days" · "Expired Sep 12"
//   shortExpiry(expiresAt, now): string          – "∞" · "2 h" · "6 d" · "expired"
//   EXPIRY_PRESETS / type ExpiryPresetId ("1h" | "1d" | "7d" | "30d" | "never")
//   presetToExpiresAt(id, now): number | null
//   extendExpiry(expiresAt, byMs, now): number | null   – never stays never; expired extends from now

import type { Share, SharePermission, ShareTargetType } from "@/lib/api/client";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

export const EXPIRING_SOON_MS = DAY;

export type ShareStatus = "active" | "expiring" | "expired";

export function shareStatus(s: Pick<Share, "expiresAt">, now: number): ShareStatus {
  if (s.expiresAt === null) return "active";
  if (s.expiresAt <= now) return "expired";
  if (s.expiresAt - now < EXPIRING_SOON_MS) return "expiring";
  return "active";
}

export type StatusFilter = "all" | "active" | "expiring" | "expired";

export interface ShareFilters {
  type: "all" | ShareTargetType;
  access: "all" | SharePermission;
  status: StatusFilter;
  q: string;
}

export const DEFAULT_SHARE_FILTERS: ShareFilters = {
  type: "all",
  access: "all",
  status: "active",
  q: "",
};

export function matchesStatus(status: ShareStatus, f: StatusFilter): boolean {
  switch (f) {
    case "all":
      return true;
    case "active":
      return status !== "expired";
    case "expiring":
      return status === "expiring";
    case "expired":
      return status === "expired";
  }
}

export function filterShares(list: readonly Share[], f: ShareFilters, now: number): Share[] {
  const needle = f.q.trim().toLowerCase();
  return list.filter((s) => {
    if (f.type !== "all" && s.targetType !== f.type) return false;
    if (f.access !== "all" && s.permission !== f.access) return false;
    if (!matchesStatus(shareStatus(s, now), f.status)) return false;
    if (!needle) return true;
    return `${s.label ?? ""} ${s.targetName ?? ""} ${s.token}`.toLowerCase().includes(needle);
  });
}

export interface ShareTargetGroup {
  key: string;
  targetType: ShareTargetType;
  targetId: string;
  name: string;
  rows: Share[];
}

export function groupByTarget(list: readonly Share[]): ShareTargetGroup[] {
  const map = new Map<string, ShareTargetGroup>();
  for (const s of list) {
    const key = `${s.targetType}:${s.targetId}`;
    const g = map.get(key);
    if (g) g.rows.push(s);
    else
      map.set(key, {
        key,
        targetType: s.targetType,
        targetId: s.targetId,
        name: s.targetName ?? "(untitled)",
        rows: [s],
      });
  }
  return [...map.values()];
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function monthDay(ts: number): string {
  const d = new Date(ts);
  return `${MONTHS[d.getMonth()]} ${String(d.getDate()).padStart(2, "0")}`;
}

const plural = (n: number, unit: string) => `${n} ${unit}${n === 1 ? "" : "s"}`;

export function expiryLabel(expiresAt: number | null, now: number): string {
  if (expiresAt === null) return "Never";
  const diff = expiresAt - now;
  if (diff <= 0) return `Expired ${monthDay(expiresAt)}`;
  if (diff < HOUR) return `in ${plural(Math.max(1, Math.ceil(diff / 60_000)), "minute")}`;
  if (diff < DAY) return `in ${plural(Math.round(diff / HOUR) || 1, "hour")}`;
  return `in ${plural(Math.round(diff / DAY), "day")}`;
}

export function shortExpiry(expiresAt: number | null, now: number): string {
  if (expiresAt === null) return "∞";
  const diff = expiresAt - now;
  if (diff <= 0) return "expired";
  if (diff < DAY) return `${Math.max(1, Math.round(diff / HOUR))} h`;
  return `${Math.round(diff / DAY)} d`;
}

export type ExpiryPresetId = "1h" | "1d" | "7d" | "30d" | "never";

export const EXPIRY_PRESETS: ReadonlyArray<{
  id: ExpiryPresetId;
  label: string;
  ms: number | null;
}> = [
  { id: "1h", label: "1 h", ms: HOUR },
  { id: "1d", label: "1 day", ms: DAY },
  { id: "7d", label: "7 days", ms: 7 * DAY },
  { id: "30d", label: "30 days", ms: 30 * DAY },
  { id: "never", label: "Never", ms: null },
];

export function presetToExpiresAt(id: ExpiryPresetId, now: number): number | null {
  const p = EXPIRY_PRESETS.find((x) => x.id === id);
  return p?.ms == null ? null : now + p.ms;
}

export function extendExpiry(expiresAt: number | null, byMs: number, now: number): number | null {
  if (expiresAt === null) return null;
  return Math.max(expiresAt, now) + byMs;
}
