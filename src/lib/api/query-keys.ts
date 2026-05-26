// Centralized React Query key factory.
//
// Two reasons this exists:
//   1) Typo safety — invalidating by string literal is fragile.
//   2) Prefix invalidation — `keys.files.all` is a tuple prefix that
//      matches every file-related query (lists, details, shares).
//
// Convention: each domain exposes `.all` (the broadest tuple), plus
// narrower factories like `.list(query)` or `.detail(id)`.

import type { FilesQuery, ShareTargetType } from "./client";

export const keys = {
  me: ["me"] as const,

  folders: {
    all: ["folders"] as const,
    list: () => ["folders", "list"] as const,
    shares: (folderId: string) => ["folders", folderId, "shares"] as const,
  },

  tags: {
    all: ["tags"] as const,
    list: () => ["tags", "list"] as const,
  },

  files: {
    all: ["files"] as const,
    listPrefix: () => ["files", "list"] as const,
    list: (q: FilesQuery) => ["files", "list", q] as const,
    detail: (id: string) => ["files", "detail", id] as const,
    shares: (fileId: string) => ["files", fileId, "shares"] as const,
    /** Static-site manifest for the editor tree. Separate from
     *  `detail` so a manifest mutation doesn't blow up the cached
     *  `LoadedFile` and force the editor to remount. */
    manifest: (fileId: string) => ["files", fileId, "manifest"] as const,
  },

  sharesAll: ["shares"] as const,

  admin: {
    users: () => ["admin", "users"] as const,
    invites: () => ["admin", "invites"] as const,
  },

  publicShare: {
    token: (token: string, fileId?: string) =>
      fileId
        ? (["public-share", token, "files", fileId] as const)
        : (["public-share", token] as const),
  },

  invitePeek: (token: string) => ["invite-peek", token] as const,
};

/**
 * Returns the right share-list query key for a given target. Used by the
 * sharing hooks so callers don't have to branch on `targetType`.
 */
export function shareListKey(targetType: ShareTargetType, targetId: string): readonly unknown[] {
  return targetType === "folder" ? keys.folders.shares(targetId) : keys.files.shares(targetId);
}
