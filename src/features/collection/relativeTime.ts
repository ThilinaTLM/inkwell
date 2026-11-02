// Friendly relative times for lists: "just now", "5m ago", "2h ago",
// "yesterday", "3d ago", "2w ago", then "Mar 4" / "Mar 2024".

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function relativeTime(ms: number, now = Date.now()): string {
  const diff = Math.max(0, now - ms);
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = new Date(ms);
  const today = new Date(now);
  const dayDiff = Math.round(
    (Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()) -
      Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())) /
      86_400_000,
  );
  if (dayDiff <= 1) return "yesterday";
  if (dayDiff < 7) return `${dayDiff}d ago`;
  if (dayDiff < 30) return `${Math.floor(dayDiff / 7)}w ago`;
  const mon = MONTHS[d.getMonth()];
  return d.getFullYear() === today.getFullYear()
    ? `${mon} ${d.getDate()}`
    : `${mon} ${d.getFullYear()}`;
}
