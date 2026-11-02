// Relative-time helpers for the Files hub (Recent, Shared, Trash).
//
//   relativeTime(ms, now?)      "just now" · "5m ago" · "3h ago" · "yesterday" · "4d ago" · "Oct 12"
//   deletesIn(purgeAt, now?)    "Deletes in 12 days" · "Deletes in 5 hours" · "Deleting soon" (past due)
//   expiresIn(expiresAt, now?)  "Never expires" · "Expires in 6 days" · "Expired 2d ago"

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

function startOfDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

const plural = (n: number, unit: string) => `${n} ${unit}${n === 1 ? "" : "s"}`;

export function relativeTime(ms: number, now: number = Date.now()): string {
  const diff = now - ms;
  if (diff < MIN) return "just now";
  if (diff < HOUR) return `${Math.floor(diff / MIN)}m ago`;
  const calendarDays = Math.round((startOfDay(now) - startOfDay(ms)) / DAY);
  if (calendarDays === 0) return `${Math.floor(diff / HOUR)}h ago`;
  if (calendarDays === 1) return "yesterday";
  if (calendarDays < 7) return `${calendarDays}d ago`;
  const sameYear = new Date(ms).getFullYear() === new Date(now).getFullYear();
  return new Date(ms).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  });
}

export function deletesIn(purgeAt: number, now: number = Date.now()): string {
  const left = purgeAt - now;
  if (left <= 0) return "Deleting soon";
  if (left < DAY) return `Deletes in ${plural(Math.max(1, Math.ceil(left / HOUR)), "hour")}`;
  return `Deletes in ${plural(Math.ceil(left / DAY), "day")}`;
}

export function expiresIn(expiresAt: number | null, now: number = Date.now()): string {
  if (expiresAt === null) return "Never expires";
  const left = expiresAt - now;
  if (left <= 0) return `Expired ${relativeTime(expiresAt, now)}`;
  if (left < HOUR) return `Expires in ${plural(Math.max(1, Math.ceil(left / MIN)), "minute")}`;
  if (left < DAY) return `Expires in ${plural(Math.round(left / HOUR), "hour")}`;
  return `Expires in ${plural(Math.round(left / DAY), "day")}`;
}
