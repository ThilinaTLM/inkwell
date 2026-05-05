// Share data hooks (owner-side + public visitor + editor-side
// shared-file loaders).
//
// `useShareList` / `useCreateShare` / `useUpdateShare` /
// `useRotateShare` / `useRevokeShare` abstract over the file-vs-folder
// dichotomy so the ShareDialog (which works for both) doesn't need its
// own internal adapter pair. The right endpoint is chosen from
// `targetType`.
//
// `useAllShares` returns every share owned by the caller across both
// targets — used by the centralized `/shares` page.
//
// The pre-refactor "Generic" duplicates (`useUpdateShareGeneric` etc.)
// are gone — `SharesPage` now passes the row's targetType to the
// regular hooks.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  type ApiError,
  type FolderSharePayload,
  files,
  folders,
  type LoadedFile,
  type Share,
  type ShareTargetType,
  shares,
} from "@/lib/api/client";
import { keys, shareListKey } from "@/lib/api/query-keys";
import { invalidations } from "./invalidations";

// ─── Owner-side ──────────────────────────────────────────────────────
export function useShareList(targetType: ShareTargetType, targetId: string, enabled = true) {
  return useQuery<Share[], ApiError>({
    queryKey: shareListKey(targetType, targetId),
    queryFn: () =>
      targetType === "folder" ? folders.listShares(targetId) : files.listShares(targetId),
    enabled: enabled && !!targetId,
  });
}

export function useCreateShare(targetType: ShareTargetType, targetId: string) {
  const qc = useQueryClient();
  return useMutation<Share, ApiError, Parameters<typeof files.createShare>[1]>({
    mutationFn: (body) =>
      targetType === "folder"
        ? folders.createShare(targetId, body)
        : files.createShare(targetId, body),
    onSuccess: () => invalidations.shareMutated(qc, targetType, targetId),
  });
}

export function useUpdateShare(targetType: ShareTargetType, targetId: string) {
  const qc = useQueryClient();
  return useMutation<Share, ApiError, { token: string; body: Parameters<typeof shares.update>[1] }>(
    {
      mutationFn: ({ token, body }) => shares.update(token, body),
      onSuccess: () => invalidations.shareMutated(qc, targetType, targetId),
    },
  );
}

export function useRotateShare(targetType: ShareTargetType, targetId: string) {
  const qc = useQueryClient();
  return useMutation<{ old: { token: string }; new: Share }, ApiError, string>({
    mutationFn: (token) => shares.rotate(token),
    onSuccess: () => invalidations.shareMutated(qc, targetType, targetId),
  });
}

export function useRevokeShare(targetType: ShareTargetType, targetId: string) {
  const qc = useQueryClient();
  return useMutation<{ ok: true }, ApiError, string>({
    mutationFn: (token) =>
      targetType === "folder"
        ? folders.revokeShare(targetId, token)
        : files.revokeShare(targetId, token),
    onSuccess: () => invalidations.shareMutated(qc, targetType, targetId),
  });
}

// ─── Cross-target hooks (the /shares management page) ────────────────
//
// Each `SharesGroup` row uses the per-target hooks above (the row
// component knows its `(targetType, targetId)` context). What's left
// for the page itself is bulk revoke, which spans multiple targets
// and must fall back to the token-only invalidation path.
export function useAllShares() {
  return useQuery<Share[], ApiError>({
    queryKey: keys.sharesAll,
    queryFn: () => shares.listAll(),
  });
}

export function useRevokeShareByToken() {
  const qc = useQueryClient();
  return useMutation<{ ok: true }, ApiError, string>({
    mutationFn: (token) => shares.revoke(token),
    onSuccess: () => invalidations.shareMutatedGeneric(qc),
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

/**
 * Loads a shared file by token. When `fileId` is given the token is
 * treated as a folder share and we load the named file; otherwise the
 * token itself addresses a single file share. Used by the editor's
 * `SharedEditorPage`.
 */
export function useSharedFile(token: string, fileId?: string) {
  return useQuery<LoadedFile, ApiError>({
    queryKey: keys.publicShare.token(token, fileId),
    queryFn: () => (fileId ? shares.loadFolderFile(token, fileId) : shares.load(token)),
    enabled: !!token,
    retry: false,
    staleTime: Infinity,
    gcTime: Infinity,
  });
}
