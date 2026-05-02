// Centralized error → user-facing message conversion.
//
// Replaces ~40 occurrences of
//   `e instanceof ApiError ? e.message : "fallback"`
// scattered through the codebase.

import { ApiError } from "@/lib/api/client";

/**
 * Returns a human-readable message for an unknown thrown value. Prefers
 * `ApiError.message` (which is already shaped by the worker), falls back
 * to the supplied default, and only as a last resort uses the raw
 * `Error.message`.
 */
export function errorMessage(e: unknown, fallback: string): string {
  if (e instanceof ApiError) return e.message || fallback;
  if (e instanceof Error && e.message) return e.message;
  return fallback;
}
