// Singleton QueryClient factory + default options.
//
// Defaults are tuned for Inkwell's reality:
//   - Most data is owned by one user → background refocus refetch is noise.
//   - 401/403/404 are deterministic; never retry them.
//   - Other transient failures (network blips, 5xx) get one retry.
//   - 30s default `staleTime` so adjacent component mounts don't re-hit
//     the worker for the same list.

import { QueryClient } from "@tanstack/react-query";
import { ApiError } from "./client";

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        refetchOnWindowFocus: false,
        retry: (count, e) => {
          if (e instanceof ApiError) {
            if (e.status === 401 || e.status === 403 || e.status === 404) return false;
          }
          return count < 2;
        },
        staleTime: 30_000,
      },
      mutations: {
        retry: false,
      },
    },
  });
}
