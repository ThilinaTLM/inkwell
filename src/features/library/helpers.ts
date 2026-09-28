// Pure helpers for the library pages (Recent / Starred / Tag / Trash)
// and the other dense tables (Shared links, Users, Invites).
//
// PUBLIC CONTRACT
//   type RecentGroupLabel = "Today" | "Yesterday" | "This week" | "Earlier"
//   recentGroupOf(ts, now): RecentGroupLabel      – local calendar days; the week starts Monday
//   groupRecent(items, getTs, now): { label, items }[]   – keeps input order, drops empty groups
//   purgeCountdown(purgeAt, now): string          – "30 d" · "5 h" · "< 1 h" · "soon"
//   purgeIsSoon(purgeAt, now): boolean            – under 3 days left
//   fmtShortDate(ts, now): string                 – "Today, 08:10" · "Yesterday, 17:02" · "Sep 20" · "Sep 20, 2025"
//   fmtBytes(n): string                           – "0 B" · "12 KB" · "3.4 MB"

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

export type RecentGroupLabel = "Today" | "Yesterday" | "This week" | "Earlier";

function startOfDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function startOfWeek(ts: number): number {
  const d = new Date(startOfDay(ts));
  const offset = (d.getDay() + 6) % 7; // Monday = 0
  d.setDate(d.getDate() - offset);
  return d.getTime();
}

export function recentGroupOf(ts: number, now: number): RecentGroupLabel {
  const today = startOfDay(now);
  if (ts >= today) return "Today";
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  if (ts >= yesterday.getTime()) return "Yesterday";
  if (ts >= startOfWeek(now)) return "This week";
  return "Earlier";
}

const GROUP_ORDER: RecentGroupLabel[] = ["Today", "Yesterday", "This week", "Earlier"];

export function groupRecent<T>(
  items: readonly T[],
  getTs: (item: T) => number,
  now: number,
): Array<{ label: RecentGroupLabel; items: T[] }> {
  const buckets = new Map<RecentGroupLabel, T[]>();
  for (const it of items) {
    const g = recentGroupOf(getTs(it), now);
    const list = buckets.get(g) ?? [];
    list.push(it);
    buckets.set(g, list);
  }
  return GROUP_ORDER.filter((g) => buckets.has(g)).map((label) => ({
    label,
    items: buckets.get(label) ?? [],
  }));
}

export function purgeCountdown(purgeAt: number, now: number): string {
  const diff = purgeAt - now;
  if (diff <= 0) return "soon";
  if (diff < HOUR) return "< 1 h";
  if (diff < DAY) return `${Math.ceil(diff / HOUR)} h`;
  return `${Math.ceil(diff / DAY)} d`;
}

export function purgeIsSoon(purgeAt: number, now: number): boolean {
  return purgeAt - now < 3 * DAY;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function hhmm(d: Date): string {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function fmtShortDate(ts: number, now: number): string {
  const d = new Date(ts);
  const today = startOfDay(now);
  const tomorrow = startOfDay(today + DAY + HOUR * 2); // DST-safe
  const yesterday = startOfDay(today - HOUR * 2);
  if (ts >= today && ts < tomorrow) return `Today, ${hhmm(d)}`;
  if (ts >= yesterday && ts < today) return `Yesterday, ${hhmm(d)}`;
  const base = `${MONTHS[d.getMonth()]} ${String(d.getDate()).padStart(2, "0")}`;
  return d.getFullYear() === new Date(now).getFullYear() ? base : `${base}, ${d.getFullYear()}`;
}

export function fmtBytes(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let v = n;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  const digits = i === 0 || v >= 10 ? 0 : 1;
  return `${v.toFixed(digits)} ${units[i]}`;
}
