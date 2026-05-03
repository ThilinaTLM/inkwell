// Admin user + invite hooks.
//
// User mutations use `setQueryData` to splice the updated row into the
// cached list (cheaper than a full refetch). Invite mutations invalidate
// because the list is small and the response shape is variable
// (creating returns a different type than `Invite`).

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type AdminUser, type ApiError, admin, type Invite, invites } from "@/lib/api/client";
import { keys } from "@/lib/api/query-keys";

// ─── Users ────────────────────────────────────────────────────────────

export function useAdminUsers() {
  return useQuery<AdminUser[], ApiError>({
    queryKey: keys.admin.users(),
    queryFn: () => admin.listUsers(),
  });
}

export function useUpdateAdminUser() {
  const qc = useQueryClient();
  return useMutation<
    AdminUser,
    ApiError,
    { id: string; patch: Parameters<typeof admin.updateUser>[1] }
  >({
    mutationFn: ({ id, patch }) => admin.updateUser(id, patch),
    onSuccess: (updated) => {
      qc.setQueryData<AdminUser[]>(keys.admin.users(), (prev) =>
        prev ? prev.map((u) => (u.id === updated.id ? updated : u)) : prev,
      );
    },
  });
}

export function useDeleteAdminUser() {
  const qc = useQueryClient();
  return useMutation<{ ok: true }, ApiError, string>({
    mutationFn: (id) => admin.deleteUser(id),
    onSuccess: (_r, id) => {
      qc.setQueryData<AdminUser[]>(keys.admin.users(), (prev) =>
        prev ? prev.filter((u) => u.id !== id) : prev,
      );
    },
  });
}

// ─── Invites (admin side) ─────────────────────────────────────────────

export function useInvites() {
  return useQuery<Invite[], ApiError>({
    queryKey: keys.admin.invites(),
    queryFn: () => admin.listInvites(),
  });
}

export function useCreateInvite() {
  const qc = useQueryClient();
  return useMutation<
    {
      token: string;
      url: string;
      expiresAt: number | null;
      createdAt: number;
    },
    ApiError,
    number | null
  >({
    mutationFn: (expiresInHours) => admin.createInvite(expiresInHours),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.admin.invites() });
    },
  });
}

export function useRevokeInvite() {
  const qc = useQueryClient();
  return useMutation<{ ok: true }, ApiError, string>({
    mutationFn: (token) => admin.revokeInvite(token),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.admin.invites() });
    },
  });
}

// ─── Invites (public side) ────────────────────────────────────────────

/**
 * Validates an invite token before showing the signup form. Returns
 * `enabled === false` if no token is provided so the hook can be called
 * unconditionally above an early return.
 */
export function useInvitePeek(token: string | undefined) {
  return useQuery({
    queryKey: keys.invitePeek(token ?? ""),
    queryFn: () => {
      if (!token) throw new Error("missing invite token");
      return invites.peek(token);
    },
    enabled: !!token,
    retry: false,
    staleTime: Infinity,
  });
}
