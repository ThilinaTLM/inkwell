// Sharing hooks.
//
// `useShareList` / `useCreateShare` / `useRevokeShare` abstract over the
// scene-vs-folder dichotomy so the ShareDialog (which works for both)
// doesn't need its own internal adapter pair. The right endpoint is
// chosen from `targetType`.

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
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: shareListKey(targetType, targetId) });
      qc.invalidateQueries({ queryKey: keys.sharesAll });
    },
  });
}

export function useRevokeShare(targetType: ShareTargetType, targetId: string) {
  const qc = useQueryClient();
  return useMutation<{ ok: true }, ApiError, string>({
    mutationFn: (token) =>
      targetType === "folder"
        ? folders.revokeShare(targetId, token)
        : scenes.revokeShare(targetId, token),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: shareListKey(targetType, targetId) });
      qc.invalidateQueries({ queryKey: keys.sharesAll });
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
