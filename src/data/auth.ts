// Authentication + invite-peek hooks.
//
// `useMe` is the single source of truth for "is the user logged in?"
// across the app. The query lifecycle replaces an ad-hoc
// `AuthStatus = "unknown" | "authed" | "anon"` state machine that used
// to live in App.tsx:
//
//   - `isPending` (no data yet, no error)         → boot splash
//   - `isError` with ApiError(401)                → anonymous
//   - `data` present                              → authed
//
// `useInvitePeek` lives here (rather than under `data/admin.ts`)
// because invite peek is a public, pre-auth concern — the invite-accept
// page calls it before any session exists.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type ApiError, auth, invites, type MeResponse, type User } from "@/lib/api/client";
import { keys } from "@/lib/api/query-keys";

export function useMe() {
  return useQuery<MeResponse, ApiError>({
    queryKey: keys.me,
    queryFn: () => auth.me(),
    // Anonymous response is a deterministic 401; don't burn retries on it.
    retry: false,
    staleTime: 60_000,
  });
}

export function useLogin() {
  const qc = useQueryClient();
  return useMutation<User, ApiError, { email: string; password: string }>({
    mutationFn: ({ email, password }) => auth.login(email, password),
    onSuccess: (user) => {
      // The login response is `User`; `me` adds `expiresAt`. Seed what
      // we know and let the next `useMe` refetch fill in the rest.
      qc.setQueryData<MeResponse>(keys.me, (prev) => ({
        ...(prev ?? ({} as MeResponse)),
        ...user,
        expiresAt: prev?.expiresAt ?? Number.MAX_SAFE_INTEGER,
      }));
    },
  });
}

export function useLogout() {
  const qc = useQueryClient();
  return useMutation<void, ApiError, void>({
    mutationFn: () => auth.logout(),
    onSettled: () => {
      // Whether the worker call succeeded or not, the local session is
      // effectively gone. Wiping the cache prevents stale data from
      // leaking into a subsequent login.
      qc.clear();
    },
  });
}

export function useChangePassword() {
  return useMutation<{ ok: true }, ApiError, { currentPassword: string; newPassword: string }>({
    mutationFn: ({ currentPassword, newPassword }) =>
      auth.changePassword(currentPassword, newPassword),
  });
}

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
