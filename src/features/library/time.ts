// Relative-time helpers for the Files hub (Recent, Shared, Trash).
//
//   deletesIn(purgeAt, now?)    "Deletes in 12 days" · "Deletes in 5 hours" · "Deleting soon" (past due)
//   expiresIn(expiresAt, now?)  "Never expires" · "Expires in 6 days" · "Expired 2d ago"

import { relTime } from "@/lib/format";

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

const plural = (n: number, unit: string) => `${n} ${unit}${n === 1 ? "" : "s"}`;

export function deletesIn(purgeAt: number, now: number = Date.now()): string {
  const left = purgeAt - now;
  if (left <= 0) return "Deleting soon";
  if (left < DAY) return `Deletes in ${plural(Math.max(1, Math.ceil(left / HOUR)), "hour")}`;
  return `Deletes in ${plural(Math.ceil(left / DAY), "day")}`;
}

export function expiresIn(expiresAt: number | null, now: number = Date.now()): string {
  if (expiresAt === null) return "Never expires";
  const left = expiresAt - now;
  if (left <= 0) return `Expired ${relTime(expiresAt, now)}`;
  if (left < HOUR) return `Expires in ${plural(Math.max(1, Math.ceil(left / MIN)), "minute")}`;
  if (left < DAY) return `Expires in ${plural(Math.round(left / HOUR), "hour")}`;
  return `Expires in ${plural(Math.round(left / DAY), "day")}`;
}
