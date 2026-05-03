// React Query hooks for authentication.
//
// `useMe` is the single source of truth for "is the user logged in?"
// across the app. The query lifecycle replaces the ad-hoc
// `AuthStatus = "unknown" | "authed" | "anon"` state machine in App.tsx:
//
//   - `isPending` (no data yet, no error)         → boot splash
//   - `isError` with ApiError(401)                → anonymous
//   - `data` present                              → authed
//
// All mutations write back into the `me` cache so the rest of the app
// reacts without a manual refetch.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type ApiError, auth, type MeResponse, type User } from "@/lib/api/client";
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
      // The login response is `User`; `me` adds `expiresAt`. We seed what we
      // know and let the next `useMe` refetch fill in the rest if anything
      // depends on it.
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
