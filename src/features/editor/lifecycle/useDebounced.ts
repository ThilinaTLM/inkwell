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
 */
export function useDebounced<A extends unknown[]>(
  fn: (...args: A) => void,
  delay: number,
): { (...args: A): void; flush(): void; cancel(): void } {
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const timer = useRef<number | null>(null);
  const lastArgs = useRef<A | null>(null);

  const wrapped = useMemo(() => {
    const cancel = () => {
      if (timer.current !== null) {
        clearTimeout(timer.current);
        timer.current = null;
      }
    };
    const flush = () => {
      if (lastArgs.current) {
        cancel();
        const args = lastArgs.current;
        lastArgs.current = null;
        fnRef.current(...args);
      }
    };
    const debounced = (...args: A) => {
      lastArgs.current = args;
      cancel();
      timer.current = window.setTimeout(() => {
        timer.current = null;
        const a = lastArgs.current;
        lastArgs.current = null;
        if (a) fnRef.current(...a);
      }, delay);
    };
    return Object.assign(debounced, { flush, cancel });
  }, [delay]);

  // Cancel on unmount so we don't fire stale saves.
  useEffect(() => () => wrapped.cancel(), [wrapped]);

  return wrapped;
}
