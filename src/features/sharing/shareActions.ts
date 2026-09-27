// Share-link operations used by the Shared links page, its details panel
// and its page commands. Permanent actions (revoke) confirm; reversible
// edits (label / access / expiry / downloads, extend) push an undo entry.
//
// PUBLIC CONTRACT
//   revokeShares(qc, shares): Promise<boolean>        – confirm, then revoke all
//   updateShareWithUndo(qc, share, patch, message?): Promise<void>
//   extendShares(qc, shares, byMs | "never"): Promise<void>   – undoable
//   type SharePatch = { label?; permission?; allowDownload?; expiresAt? }

import type { QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { invalidations } from "@/data/invalidations";
import { confirmDialog } from "@/features/dialogs/dialogStore";
import { type Share, shares as sharesApi } from "@/lib/api/client";
import { keys } from "@/lib/api/query-keys";
import { errorMessage } from "@/lib/errors";
import { toastWithUndo } from "@/lib/undo";
import { extendExpiry } from "./shareStatus";

export type SharePatch = Parameters<typeof sharesApi.update>[1];

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;

function patchCache(qc: QueryClient, token: string, patch: Partial<Share>) {
  qc.setQueryData<Share[]>(keys.sharesAll, (prev) =>
    prev?.map((s) => (s.token === token ? { ...s, ...patch } : s)),
  );
}

export async function revokeShares(qc: QueryClient, list: Share[]): Promise<boolean> {
  if (!list.length) return false;
  const ok = await confirmDialog({
    title: list.length === 1 ? "Revoke this link?" : `Revoke ${plural(list.length, "link")}?`,
    description: "Anyone using them loses access immediately. This can't be undone.",
    confirmLabel: list.length === 1 ? "Revoke" : `Revoke ${list.length}`,
  });
  if (!ok) return false;
  const results = await Promise.allSettled(list.map((s) => sharesApi.revoke(s.token)));
  const failed = results.filter((r) => r.status === "rejected").length;
  invalidations.shareMutatedGeneric(qc);
  if (failed) toast.error(`${plural(failed, "link")} could not be revoked`);
  else toast.success(list.length === 1 ? "Link revoked" : `Revoked ${plural(list.length, "link")}`);
  return true;
}

function pick(s: Share, patch: SharePatch): SharePatch {
  const prev: SharePatch = {};
  if ("label" in patch) prev.label = s.label;
  if ("permission" in patch) prev.permission = s.permission;
  if ("allowDownload" in patch) prev.allowDownload = s.allowDownload;
  if ("expiresAt" in patch) prev.expiresAt = s.expiresAt;
  return prev;
}

export async function updateShareWithUndo(
  qc: QueryClient,
  share: Share,
  patch: SharePatch,
  message = "Link updated",
): Promise<void> {
  const prev = pick(share, patch);
  patchCache(qc, share.token, patch as Partial<Share>);
  try {
    await sharesApi.update(share.token, patch);
    invalidations.shareMutatedGeneric(qc);
    toastWithUndo(message, async () => {
      patchCache(qc, share.token, prev as Partial<Share>);
      await sharesApi.update(share.token, prev);
      invalidations.shareMutatedGeneric(qc);
    });
  } catch (e) {
    invalidations.shareMutatedGeneric(qc);
    toast.error(errorMessage(e, "could not update link"));
  }
}

export async function extendShares(
  qc: QueryClient,
  list: Share[],
  by: number | "never",
): Promise<void> {
  if (!list.length) return;
  const now = Date.now();
  const before = list.map((s) => ({ token: s.token, expiresAt: s.expiresAt }));
  const next = list.map((s) => ({
    token: s.token,
    expiresAt: by === "never" ? null : extendExpiry(s.expiresAt, by, now),
  }));
  for (const n of next) patchCache(qc, n.token, { expiresAt: n.expiresAt });
  try {
    await Promise.all(next.map((n) => sharesApi.update(n.token, { expiresAt: n.expiresAt })));
    invalidations.shareMutatedGeneric(qc);
    toastWithUndo(
      by === "never"
        ? `${plural(list.length, "link")} set to never expire`
        : `Extended ${plural(list.length, "link")}`,
      async () => {
        for (const b of before) patchCache(qc, b.token, { expiresAt: b.expiresAt });
        await Promise.all(before.map((b) => sharesApi.update(b.token, { expiresAt: b.expiresAt })));
        invalidations.shareMutatedGeneric(qc);
      },
    );
  } catch (e) {
    invalidations.shareMutatedGeneric(qc);
    toast.error(errorMessage(e, "could not extend expiry"));
  }
}
