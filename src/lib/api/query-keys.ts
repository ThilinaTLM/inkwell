// Centralized React Query key factory.
//
// Two reasons this exists:
//   1) Typo safety — invalidating by string literal is fragile.
//   2) Prefix invalidation — `keys.scenes.all` is a tuple prefix that
//      matches every scene-related query (lists, details, shares).
//
// Convention: each domain exposes `.all` (the broadest tuple), plus
// narrower factories like `.list(query)` or `.detail(id)`.

import type { ScenesQuery, ShareTargetType } from "./client";

export const keys = {
  me: ["me"] as const,

  folders: {
    all: ["folders"] as const,
    list: () => ["folders", "list"] as const,
    shares: (folderId: string) =>
      ["folders", folderId, "shares"] as const,
  },

  tags: {
    all: ["tags"] as const,
    list: () => ["tags", "list"] as const,
  },

  scenes: {
    all: ["scenes"] as const,
    list: (q: ScenesQuery) => ["scenes", "list", q] as const,
    detail: (id: string) => ["scenes", "detail", id] as const,
    shares: (sceneId: string) => ["scenes", sceneId, "shares"] as const,
  },

  sharesAll: ["shares"] as const,

  admin: {
    users: () => ["admin", "users"] as const,
    invites: () => ["admin", "invites"] as const,
  },

  publicShare: {
    token: (token: string, sceneId?: string) =>
      sceneId
        ? (["public-share", token, "scenes", sceneId] as const)
        : (["public-share", token] as const),
  },

  invitePeek: (token: string) => ["invite-peek", token] as const,
};

/**
 * Returns the right share-list query key for a given target. Used by the
 * sharing hooks so callers don't have to branch on `targetType`.
 */
export function shareListKey(
  targetType: ShareTargetType,
  targetId: string,
): readonly unknown[] {
  return targetType === "folder"
    ? keys.folders.shares(targetId)
    : keys.scenes.shares(targetId);
}
