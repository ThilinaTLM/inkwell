// Mutation + toast wrapper.
//
// 15+ sites in the SPA repeated this exact pattern:
//
//   try {
//     const result = await mutation.mutateAsync(args);
//     toast.success(...);
//     onClose();
//   } catch (e) {
//     toast.error(errorMessage(e, fallback));
//   }
//
// `useMutationWithToast` returns a stable `run(vars)` that wraps the
// mutation, toasts the right message, swallows the error (returns
// `null`), and preserves the success result for callers that need it
// (e.g. dialogs closing only on success).

import type { UseMutationResult } from "@tanstack/react-query";
import { useCallback } from "react";
import { toast } from "sonner";
import { errorMessage } from "@/lib/errors";

export interface ToastMessages<TResult, TVars> {
  /** Success copy. May depend on the mutation result and the input vars. */
  success: string | ((result: TResult, vars: TVars) => string);
  /**
   * Error copy. May depend on the thrown value and the input vars.
   * Defaults to `errorMessage(e, fallback)`.
   */
  error?: string | ((err: unknown, vars: TVars) => string);
  /** Default error fallback when the mutation throws a non-ApiError. */
  fallback?: string;
}

/**
 * Wraps a mutation with toast wiring. Returns a stable async runner
 * that resolves to the mutation result on success, or `null` on
 * failure (so callers can do `if (await run(args)) close();`).
 */
export function useMutationWithToast<TResult, TError, TVars>(
  mutation: UseMutationResult<TResult, TError, TVars>,
  messages: ToastMessages<TResult, TVars>,
): (vars: TVars) => Promise<TResult | null> {
  const { mutateAsync } = mutation;
  return useCallback(
    async (vars: TVars): Promise<TResult | null> => {
      try {
        const result = await mutateAsync(vars);
        const successText =
          typeof messages.success === "function"
            ? messages.success(result, vars)
            : messages.success;
        toast.success(successText);
        return result;
      } catch (e) {
        const errorText =
          typeof messages.error === "function"
            ? messages.error(e, vars)
            : (messages.error ?? errorMessage(e, messages.fallback ?? "Something went wrong."));
        toast.error(errorText);
        return null;
      }
    },
    [mutateAsync, messages.success, messages.error, messages.fallback],
  );
}
