// Date / time formatting helpers shared across the app.
//
// `relTime` was previously copy-pasted into BrowseView and SharedFolder.
// `fmtDateTime` was duplicated as `fmtDate` in Admin.tsx and `fmt`
// in ShareDialog.tsx.

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

function startOfDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** "Mar 4" this year, "Mar 4, 2025" otherwise. */
export function fmtDate(ms: number, now: number = Date.now()): string {
  const sameYear = new Date(ms).getFullYear() === new Date(now).getFullYear();
  return new Date(ms).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  });
}

/** Date + short time, e.g. "Mar 4, 2:32 PM". */
export function fmtDateTime(ms: number, now: number = Date.now()): string {
  const t = new Date(ms).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return `${fmtDate(ms, now)}, ${t}`;
}

/**
 * The single relative-time helper: "just now", "5m ago", "2h ago",
 * "yesterday", weekday (< 7 days), "Mar 4" (this year), "Mar 4, 2025".
 */
export function relTime(ms: number, now: number = Date.now()): string {
  const diff = Math.max(0, now - ms);
  if (diff < MIN) return "just now";
  if (diff < HOUR) return `${Math.floor(diff / MIN)}m ago`;
  const days = Math.round((startOfDay(now) - startOfDay(ms)) / DAY);
  if (days <= 0) return `${Math.floor(diff / HOUR)}h ago`;
  if (days === 1) return "yesterday";
  if (days < 7) return new Date(ms).toLocaleDateString(undefined, { weekday: "long" });
  return fmtDate(ms, now);
}

/**
 * Truncate a long string by inserting an ellipsis in the middle. Keeps
 * the head and tail visible — useful for share URLs where the host AND
 * the trailing token are both useful signals.
 *
 *   truncateMiddle("https://example.com/share/abc12345xyz", 28)
 *     → "https://exam…/share/abc12345xyz" (approximately)
 */
export function truncateMiddle(s: string, max = 48): string {
  if (s.length <= max) return s;
  // Reserve at least 1 char for the ellipsis; bias slightly toward the
  // tail so the share token stays visible.
  const keepEnd = Math.floor((max - 1) / 2) + 2;
  const keepStart = max - 1 - keepEnd;
  return `${s.slice(0, keepStart)}…${s.slice(s.length - keepEnd)}`;
}

/**
 * "Expires in 6d" / "expires Jan 12" / null when no expiry. Used by share
 * rows so the fact-of-expiry is at-a-glance visible without computing in
 * the component.
 */
export function expiresPhrase(expiresAt: number | null): string | null {
  if (expiresAt === null) return null;
  const now = Date.now();
  const diff = expiresAt - now;
  if (diff <= 0) return "expired";
  const days = Math.floor(diff / 86_400_000);
  if (days <= 0) {
    const hours = Math.max(1, Math.floor(diff / 3_600_000));
    return `expires in ${hours}h`;
  }
  if (days <= 7) return `expires in ${days}d`;
  return `expires ${fmtDate(expiresAt, now)}`;
}
