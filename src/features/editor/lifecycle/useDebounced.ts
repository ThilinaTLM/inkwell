// Lifecycle-internal debounce.
//
// Originally lived in `src/hooks/useDebounced.ts` as a "general
// utility", but the editor save lifecycle is the only consumer. Moved
// here so the hook stays close to its single use site and the
// shared-lifecycle surface is self-contained.

import { useEffect, useMemo, useRef } from "react";

/**
 * Returns a stable function that invokes `fn` with the latest arguments
 * after `delay`ms of inactivity. The wrapped function exposes
 * `flush()` to invoke immediately and `cancel()` to drop the pending
 * call. Latest closure of `fn` is always used, so the consumer doesn't
 * need to memoize it.
 *
 * `maxWait` (optional) caps how long a continuous burst of calls can
 * postpone the invocation: once the first pending call is `maxWait`ms
 * old, the next timer fires no later than that deadline.
 */
export function useDebounced<A extends unknown[]>(
  fn: (...args: A) => void,
  delay: number,
  maxWait?: number,
): { (...args: A): void; flush(): void; cancel(): void } {
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const timer = useRef<number | null>(null);
  const lastArgs = useRef<A | null>(null);
  // Timestamp of the first call in the current burst (for `maxWait`).
  const burstStart = useRef<number | null>(null);

  const wrapped = useMemo(() => {
    const cancel = () => {
      if (timer.current !== null) {
        clearTimeout(timer.current);
        timer.current = null;
      }
      // Drop any pending args so a later `flush()` (e.g. the
      // unmount cleanup in `useSaveLifecycle`, or a subsequent
      // `beforeunload`) can't resurrect a call the caller has
      // explicitly cancelled. Without this, clicking "Discard" in
      // the leave dialog still persists the discarded edits via
      // the unmount flush.
      lastArgs.current = null;
      burstStart.current = null;
    };
    const flush = () => {
      if (lastArgs.current) {
        const args = lastArgs.current;
        lastArgs.current = null;
        burstStart.current = null;
        if (timer.current !== null) {
          clearTimeout(timer.current);
          timer.current = null;
        }
        fnRef.current(...args);
      }
    };
    const debounced = (...args: A) => {
      const now = Date.now();
      const started = burstStart.current ?? now;
      cancel();
      lastArgs.current = args;
      burstStart.current = started;
      const wait =
        maxWait === undefined ? delay : Math.max(0, Math.min(delay, started + maxWait - now));
      timer.current = window.setTimeout(() => {
        timer.current = null;
        burstStart.current = null;
        const a = lastArgs.current;
        lastArgs.current = null;
        if (a) fnRef.current(...a);
      }, wait);
    };
    return Object.assign(debounced, { flush, cancel });
  }, [delay, maxWait]);

  // Cancel on unmount so we don't fire stale saves.
  useEffect(() => () => wrapped.cancel(), [wrapped]);

  return wrapped;
}
