// Sharing hooks.
//
// `useShareList` / `useCreateShare` / `useUpdateShare` / `useRotateShare` /
// `useRevokeShare` abstract over the scene-vs-folder dichotomy so the
// ShareDialog (which works for both) doesn't need its own internal
// adapter pair. The right endpoint is chosen from `targetType`.
//
// `useAllShares` returns every share owned by the caller across both
// targets — used by the centralized `/shares` page.
//
// Mutations invalidate three caches each:
//   - the per-target share list (so the calling dialog refreshes),
//   - `keys.sharesAll` (so the `/shares` page refreshes),
//   - `keys.scenes.all` and `keys.folders.all` (so card-level
//     `activeShareCount` pills refresh).
// Edit/rotate also invalidate the per-target list under the *new*
// token — but rotate replaces the token; the list is keyed by target
// id, not token, so a single invalidate covers both.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  type ApiError,
  type FolderSharePayload,
  folders,
  type Share,
  type ShareTargetType,
  scenes,
  shares,
} from "@/lib/api/client";
import { keys, shareListKey } from "@/lib/api/query-keys";

// All caches that may need to refresh after a share mutation.
function invalidateShareCaches(
  qc: ReturnType<typeof useQueryClient>,
  targetType: ShareTargetType,
  targetId: string,
) {
  qc.invalidateQueries({ queryKey: shareListKey(targetType, targetId) });
  qc.invalidateQueries({ queryKey: keys.sharesAll });
  // Card-level `activeShareCount` lives on scene/folder list rows.
  qc.invalidateQueries({ queryKey: keys.scenes.all });
  qc.invalidateQueries({ queryKey: keys.folders.all });
}

export function useShareList(targetType: ShareTargetType, targetId: string, enabled = true) {
  return useQuery<Share[], ApiError>({
    queryKey: shareListKey(targetType, targetId),
    queryFn: () =>
      targetType === "folder" ? folders.listShares(targetId) : scenes.listShares(targetId),
    enabled: enabled && !!targetId,
  });
}

export function useCreateShare(targetType: ShareTargetType, targetId: string) {
  const qc = useQueryClient();
  return useMutation<Share, ApiError, Parameters<typeof scenes.createShare>[1]>({
    mutationFn: (body) =>
      targetType === "folder"
        ? folders.createShare(targetId, body)
        : scenes.createShare(targetId, body),
    onSuccess: () => invalidateShareCaches(qc, targetType, targetId),
  });
}

export function useUpdateShare(targetType: ShareTargetType, targetId: string) {
  const qc = useQueryClient();
  return useMutation<Share, ApiError, { token: string; body: Parameters<typeof shares.update>[1] }>(
    {
      mutationFn: ({ token, body }) => shares.update(token, body),
      onSuccess: () => invalidateShareCaches(qc, targetType, targetId),
    },
  );
}

export function useRotateShare(targetType: ShareTargetType, targetId: string) {
  const qc = useQueryClient();
  return useMutation<{ old: { token: string }; new: Share }, ApiError, string>({
    mutationFn: (token) => shares.rotate(token),
    onSuccess: () => invalidateShareCaches(qc, targetType, targetId),
  });
}

export function useRevokeShare(targetType: ShareTargetType, targetId: string) {
  const qc = useQueryClient();
  return useMutation<{ ok: true }, ApiError, string>({
    mutationFn: (token) =>
      targetType === "folder"
        ? folders.revokeShare(targetId, token)
        : scenes.revokeShare(targetId, token),
    onSuccess: () => invalidateShareCaches(qc, targetType, targetId),
  });
}

// ─── Cross-target hooks (for the /shares management page) ─────────────

export function useAllShares() {
  return useQuery<Share[], ApiError>({
    queryKey: keys.sharesAll,
    queryFn: () => shares.listAll(),
  });
}

/** Generic revoke that works regardless of `targetType`; used by the
 *  /shares page where rows have mixed targets. Invalidates both
 *  scene-list and folder-list caches because we don't know which one
 *  any given token came from. */
export function useRevokeShareGeneric() {
  const qc = useQueryClient();
  return useMutation<{ ok: true }, ApiError, string>({
    mutationFn: (token) => shares.revoke(token),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.sharesAll });
      qc.invalidateQueries({ queryKey: keys.scenes.all });
      qc.invalidateQueries({ queryKey: keys.folders.all });
    },
  });
}

/** Generic update for the /shares page (no per-target invalidation
 *  needed since rows aren't keyed by target id there). */
export function useUpdateShareGeneric() {
  const qc = useQueryClient();
  return useMutation<Share, ApiError, { token: string; body: Parameters<typeof shares.update>[1] }>(
    {
      mutationFn: ({ token, body }) => shares.update(token, body),
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: keys.sharesAll });
        qc.invalidateQueries({ queryKey: keys.scenes.all });
        qc.invalidateQueries({ queryKey: keys.folders.all });
      },
    },
  );
}

/** Generic rotate for the /shares page. */
export function useRotateShareGeneric() {
  const qc = useQueryClient();
  return useMutation<{ old: { token: string }; new: Share }, ApiError, string>({
    mutationFn: (token) => shares.rotate(token),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.sharesAll });
      qc.invalidateQueries({ queryKey: keys.scenes.all });
      qc.invalidateQueries({ queryKey: keys.folders.all });
    },
  });
}

// ─── Public-token (visitor) hooks ─────────────────────────────────────

export function useSharedFolder(token: string) {
  return useQuery<FolderSharePayload, ApiError>({
    queryKey: keys.publicShare.token(token),
    queryFn: () => shares.loadFolder(token),
    enabled: !!token,
    retry: false,
    staleTime: Infinity,
  });
}
