// Date / time formatting helpers shared across the app.
//
// `relTime` was previously copy-pasted into BrowseView, RecentView,
// SearchView, and SharedFolder. `fmtDateTime` was duplicated as `fmtDate`
// in Admin.tsx and `fmt` in ShareDialog.tsx.

/**
 * Human-friendly relative time: "just now", "5m ago", "3h ago", "2d ago",
 * or an absolute date for anything older than ~30 days.
 */
export function relTime(ms: number): string {
  const diff = Date.now() - ms;
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(ms).toLocaleDateString();
}

/** Locale date only, e.g. "11/2/2026". */
export function fmtDate(ms: number): string {
  return new Date(ms).toLocaleDateString();
}

/** Locale date + short time, e.g. "11/2/2026 14:32". */
export function fmtDateTime(ms: number): string {
  const d = new Date(ms);
  return (
    d.toLocaleDateString() +
    " " +
    d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
  );
}
